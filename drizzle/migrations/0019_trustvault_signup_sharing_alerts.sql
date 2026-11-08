-- 0019: self-service verified signup role, owner share-by-verified-email, persistent sign-in alerts.
-- Earlier migrations and audit canonical bytes are untouched; functions are added and tv_operation gains a dispatch line.

-- Shared guarded identity check (same shape as tv_admin_events): unverified => NULL actor/session.
CREATE FUNCTION public.tv_verified_caller(OUT actor uuid, OUT sid uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE claims jsonb; uuid_re constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; a uuid; s uuid;
BEGIN
 actor:=NULL; sid:=NULL;
 claims:=auth.jwt();
 IF claims IS NOT NULL AND jsonb_typeof(claims)='object'
   AND jsonb_typeof(claims->'sub')='string' AND lower(claims->>'sub') ~ uuid_re
   AND jsonb_typeof(claims->'session_id')='string' AND lower(claims->>'session_id') ~ uuid_re
   AND jsonb_typeof(claims->'exp')='number' AND (claims->>'exp') ~ '^[1-9][0-9]{0,11}$'
   AND (claims->>'exp')::numeric>extract(epoch FROM clock_timestamp()) THEN
   a:=(claims->>'sub')::uuid; s:=(claims->>'session_id')::uuid;
   IF public.tv_bridge_identity(a,s) THEN actor:=a; sid:=s; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.tv_verified_caller() FROM PUBLIC,anon,authenticated,service_role;

-- 1. Self-service role: a self-registered account becomes document_creator only when its email is first verified.
-- Accounts inserted already-confirmed (operator provisioning) keep the default viewer role. Administrator is never self-assignable.
CREATE FUNCTION public.tv_self_service_verified() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.user_roles SET role='document_creator' WHERE user_id=NEW.id AND role='viewer';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tv_self_service_verified() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tv_account_email_verified AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW
 WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL) EXECUTE FUNCTION public.tv_self_service_verified();

-- 2. Share by verified email (owner-only, rate bounded, audited; grant itself goes through the existing audited grant path).
ALTER TABLE public.document_grants ADD COLUMN shared_email text;
COMMENT ON COLUMN public.document_grants.shared_email IS 'Lowercased address the owner typed when sharing by email; NULL for grants made by account ID.';
CREATE TABLE public.share_email_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX share_email_attempts_actor_at ON public.share_email_attempts(actor_id,at);
REVOKE ALL ON public.share_email_attempts FROM PUBLIC,anon,authenticated;
ALTER TABLE public.share_email_attempts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.tv_share_email(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 caller record; req uuid:=gen_random_uuid(); doc public.documents; recipient uuid; addr text; inner_result jsonb; recent integer;
 uuid_re constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; k text;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT * INTO caller FROM public.tv_verified_caller();
 IF caller.actor IS NULL THEN
   PERFORM public.tv_append_audit_v2(NULL,NULL,'share_email','denied','invalid_session',NULL,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',401,'error','Authentication required');
 END IF;
 IF payload IS NULL OR octet_length(payload::text)>16384 THEN
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,'share_email','denied','request_too_large',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',413,'error','Request too large');
 END IF;
 IF jsonb_typeof(payload)<>'object' THEN
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,'share_email','denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
 END IF;
 FOR k IN SELECT jsonb_object_keys(payload) LOOP
   IF k NOT IN ('id','revision','email','permission') THEN
     PERFORM public.tv_append_audit_v2(caller.actor,NULL,'share_email','denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
     RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
   END IF;
 END LOOP;
 IF jsonb_typeof(payload->'id') IS DISTINCT FROM 'string' OR lower(payload->>'id') !~ uuid_re
   OR jsonb_typeof(payload->'revision') IS DISTINCT FROM 'number' OR (payload->>'revision') !~ '^[1-9][0-9]{0,17}$'
   OR jsonb_typeof(payload->'email') IS DISTINCT FROM 'string' OR length(btrim(payload->>'email'))>254 OR btrim(payload->>'email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
   OR jsonb_typeof(payload->'permission') IS DISTINCT FROM 'string' OR (payload->>'permission') NOT IN ('read','edit') THEN
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,'share_email','denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
 END IF;
 SELECT * INTO doc FROM public.documents WHERE id=(payload->>'id')::uuid FOR UPDATE;
 -- Non-owners get the same response as a missing document, before any address lookup.
 IF doc.id IS NULL OR doc.deleted_at IS NOT NULL OR doc.owner_id<>caller.actor THEN
   PERFORM public.tv_append_audit_v2(caller.actor,(payload->>'id')::uuid,'share_email','denied','missing_or_ungranted',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',404,'error','Not found');
 END IF;
 SELECT count(*) INTO recent FROM public.share_email_attempts WHERE actor_id=caller.actor AND at>clock_timestamp()-interval '1 hour';
 IF recent>=20 THEN
   PERFORM public.tv_append_audit_v2(caller.actor,doc.id,'share_email','denied','rate_limited',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',429,'error','Too many sharing attempts. Try again later.');
 END IF;
 INSERT INTO public.share_email_attempts(actor_id) VALUES(caller.actor);
 addr:=lower(btrim(payload->>'email'));
 SELECT u.id INTO recipient FROM auth.users u JOIN public.profiles p ON p.user_id=u.id
  WHERE lower(u.email)=addr AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
    AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND p.active
  LIMIT 1;
 IF recipient IS NULL OR recipient=caller.actor THEN
   PERFORM public.tv_append_audit_v2(caller.actor,doc.id,'share_email','denied','recipient_unavailable',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',404,'error','No eligible account for that address');
 END IF;
 -- The existing grant path re-verifies identity, ownership, revision and target, and writes the v2 grant audit.
 inner_result:=public.tv_operation('grant',jsonb_build_object('id',doc.id,'revision',(payload->>'revision')::bigint,'user_id',recipient,'permission',payload->>'permission'));
 IF (inner_result->>'status')='200' THEN
   UPDATE public.document_grants SET shared_email=addr WHERE document_id=doc.id AND user_id=recipient;
   RETURN jsonb_build_object('request_id',inner_result->'request_id','status',200,'data',jsonb_build_object('revision',inner_result->'data'->'revision','user_id',recipient,'shared_email',addr));
 END IF;
 RETURN inner_result;
END $$;
REVOKE ALL ON FUNCTION public.tv_share_email(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- 3. Persistent in-app sign-in alerts. One row per recipient/kind/subject/hour, counted, so repeats cannot flood.
CREATE TABLE public.account_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('own_sign_in','account_sign_in','own_session_denied','account_session_denied')),
 subject_id uuid NOT NULL,
 bucket_start timestamptz NOT NULL,
 first_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 occurrences integer NOT NULL DEFAULT 1,
 read_at timestamptz,
 UNIQUE(recipient_id,kind,subject_id,bucket_start)
);
CREATE INDEX account_notifications_recipient ON public.account_notifications(recipient_id,last_at DESC);
REVOKE ALL ON public.account_notifications FROM PUBLIC,anon,authenticated;
ALTER TABLE public.account_notifications ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.tv_notify(recipient uuid,k text,subject uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.account_notifications(recipient_id,kind,subject_id,bucket_start) VALUES(recipient,k,subject,date_trunc('hour',clock_timestamp()))
 ON CONFLICT(recipient_id,kind,subject_id,bucket_start) DO UPDATE SET occurrences=public.account_notifications.occurrences+1,last_at=clock_timestamp(),read_at=NULL;
END $$;
REVOKE ALL ON FUNCTION public.tv_notify(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Accepted sign-ins: the auth service sets last_sign_in_at only after it verified credentials (not on token refresh).
CREATE FUNCTION public.tv_sign_in_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin_id uuid;
BEGIN
 BEGIN
   PERFORM public.tv_notify(NEW.id,'own_sign_in',NEW.id);
   FOR admin_id IN SELECT r.user_id FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.role='administrator' AND p.active AND r.user_id<>NEW.id LOOP
     PERFORM public.tv_notify(admin_id,'account_sign_in',NEW.id);
   END LOOP;
 EXCEPTION WHEN OTHERS THEN
   -- Alerts must never block sign-in; failure is surfaced to operators via server logs only.
   RAISE WARNING 'tv_sign_in_alert failed: %', SQLSTATE;
 END;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tv_sign_in_alert() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tv_account_signed_in AFTER UPDATE OF last_sign_in_at ON auth.users FOR EACH ROW
 WHEN (NEW.last_sign_in_at IS NOT NULL AND NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at) EXECUTE FUNCTION public.tv_sign_in_alert();

-- Denied app access with a genuinely issued token whose session/account is no longer valid.
-- Only reasons where tv_operation recorded the token's subject; unattributed (NULL actor) denials never alert anyone.
CREATE FUNCTION public.tv_session_denied_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin_id uuid;
BEGIN
 IF NEW.actor_id IS NOT NULL AND NEW.outcome='denied' AND NEW.reason IN ('revoked_session','disabled_identity','inactive_account') THEN
   PERFORM public.tv_notify(NEW.actor_id,'own_session_denied',NEW.actor_id);
   FOR admin_id IN SELECT r.user_id FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.role='administrator' AND p.active AND r.user_id<>NEW.actor_id LOOP
     PERFORM public.tv_notify(admin_id,'account_session_denied',NEW.actor_id);
   END LOOP;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tv_session_denied_alert() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tv_session_denied_alert AFTER INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.tv_session_denied_alert();

-- Own-notifications boundary: verified caller sees only rows addressed to them; reads/updates are audited.
CREATE FUNCTION public.tv_notifications(act text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caller record; req uuid:=gen_random_uuid(); rows jsonb; n integer; k text;
 uuid_re constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT * INTO caller FROM public.tv_verified_caller();
 IF caller.actor IS NULL THEN
   PERFORM public.tv_append_audit_v2(NULL,NULL,act,'denied','invalid_session',NULL,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',401,'error','Authentication required');
 END IF;
 IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR octet_length(payload::text)>1024 THEN
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
 END IF;
 FOR k IN SELECT jsonb_object_keys(payload) LOOP
   IF NOT ((act='notifications' AND k='limit') OR (act='notifications_read' AND k='id')) THEN
     PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
     RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
   END IF;
 END LOOP;
 IF act='notifications' THEN
   IF payload ? 'limit' AND (jsonb_typeof(payload->'limit')<>'number' OR (payload->>'limit') !~ '^[1-9][0-9]?$' OR (payload->>'limit')::integer>50) THEN
     PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
     RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
   END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.last_at DESC),'[]'::jsonb) INTO rows FROM (
     SELECT id,kind,subject_id,first_at,last_at,occurrences,read_at FROM public.account_notifications
     WHERE recipient_id=caller.actor ORDER BY last_at DESC LIMIT coalesce((payload->>'limit')::integer,50)) t;
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'allowed','authorized',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',200,'data',rows);
 END IF;
 IF payload ? 'id' AND (jsonb_typeof(payload->'id')<>'string' OR lower(payload->>'id') !~ uuid_re) THEN
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
 END IF;
 UPDATE public.account_notifications SET read_at=clock_timestamp()
  WHERE recipient_id=caller.actor AND read_at IS NULL AND (NOT payload ? 'id' OR id=(payload->>'id')::uuid);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF payload ? 'id' AND n=0 THEN
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','missing_or_ungranted',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',404,'error','Not found');
 END IF;
 PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'allowed','authorized',caller.sid,req,'{}'::jsonb);
 RETURN jsonb_build_object('request_id',req,'status',200,'data',jsonb_build_object('marked',n));
END $$;
REVOKE ALL ON FUNCTION public.tv_notifications(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Route through the existing single entry point, before any other logic.
DO $migration$
DECLARE definition text; original text;
BEGIN
 SELECT pg_get_functiondef('public.tv_operation(text,jsonb)'::regprocedure) INTO original;
 definition:=replace(original,' IF action=''admin_events'' THEN',
  ' IF action=''share_email'' THEN RETURN public.tv_share_email(coalesce(payload,''null''::jsonb)); END IF;
 IF action IN (''notifications'',''notifications_read'') THEN RETURN public.tv_notifications(action,coalesce(payload,''null''::jsonb)); END IF;
 IF action=''admin_events'' THEN');
 IF definition=original THEN RAISE EXCEPTION 'Share/notification dispatch did not match expected definition'; END IF;
 EXECUTE definition;
END $migration$;
