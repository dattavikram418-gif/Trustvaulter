-- 0020: address ambiguity and locking, audit fault isolation, and current admin visibility.

CREATE OR REPLACE FUNCTION public.tv_share_email(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 caller record; req uuid:=gen_random_uuid(); doc public.documents; recipient uuid; addr text; inner_result jsonb; recent integer; matches uuid[];
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
 -- Hold the verified account and profile rows until the grant transaction ends.
 -- A concurrent email/profile change must wait or be reflected in this lookup.
 SELECT array_agg(candidate.id) INTO matches FROM (
   SELECT u.id FROM auth.users u JOIN public.profiles p ON p.user_id=u.id
    WHERE lower(u.email)=addr AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
      AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND p.active
    ORDER BY u.id LIMIT 2 FOR SHARE OF u,p
 ) candidate;
 recipient:=matches[1];
 IF coalesce(cardinality(matches),0)<>1 OR recipient=caller.actor THEN
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

CREATE OR REPLACE FUNCTION public.tv_session_denied_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin_id uuid;
BEGIN
 IF NEW.actor_id IS NOT NULL AND NEW.outcome='denied' AND NEW.reason IN ('revoked_session','disabled_identity','inactive_account') THEN
   BEGIN
     PERFORM public.tv_notify(NEW.actor_id,'own_session_denied',NEW.actor_id);
     FOR admin_id IN SELECT r.user_id FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.role='administrator' AND p.active AND r.user_id<>NEW.actor_id LOOP
       PERFORM public.tv_notify(admin_id,'account_session_denied',NEW.actor_id);
     END LOOP;
   EXCEPTION WHEN OTHERS THEN
     -- Notification failures must not roll back the authoritative denial audit.
     RAISE WARNING 'tv_session_denied_alert failed: %', SQLSTATE;
   END;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.tv_notifications(act text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caller record; req uuid:=gen_random_uuid(); rows jsonb; n integer; k text; is_admin boolean; requested_limit integer;
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
 SELECT r.role='administrator' INTO is_admin FROM public.user_roles r
  WHERE r.user_id=caller.actor FOR SHARE;
 IF act='notifications' THEN
   IF payload ? 'limit' AND (jsonb_typeof(payload->'limit')<>'number' OR (payload->>'limit') !~ '^[1-9][0-9]?$') THEN
     PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
     RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
   END IF;
   requested_limit:=coalesce((payload->>'limit')::integer,50);
   IF requested_limit>50 THEN
     PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
     RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
   END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.last_at DESC),'[]'::jsonb) INTO rows FROM (
     SELECT id,kind,subject_id,first_at,last_at,occurrences,read_at FROM public.account_notifications
     WHERE recipient_id=caller.actor
       AND (is_admin OR kind IN ('own_sign_in','own_session_denied'))
     ORDER BY last_at DESC LIMIT requested_limit) t;
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'allowed','authorized',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',200,'data',rows);
 END IF;
 IF payload ? 'id' AND (jsonb_typeof(payload->'id')<>'string' OR lower(payload->>'id') !~ uuid_re) THEN
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','invalid_parameters',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
 END IF;
 UPDATE public.account_notifications SET read_at=clock_timestamp()
  WHERE recipient_id=caller.actor AND read_at IS NULL
    AND (is_admin OR kind IN ('own_sign_in','own_session_denied')) AND (NOT payload ? 'id' OR id=(payload->>'id')::uuid);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF payload ? 'id' AND n=0 THEN
   PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'denied','missing_or_ungranted',caller.sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',404,'error','Not found');
 END IF;
 PERFORM public.tv_append_audit_v2(caller.actor,NULL,act,'allowed','authorized',caller.sid,req,'{}'::jsonb);
 RETURN jsonb_build_object('request_id',req,'status',200,'data',jsonb_build_object('marked',n));
END $$;
