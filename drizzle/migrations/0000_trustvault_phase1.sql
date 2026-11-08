-- Metadata only. No storage objects, byte paths or bearer links.
CREATE TYPE public.tv_role AS ENUM ('administrator','document_creator','viewer');
CREATE TABLE public.profiles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true
);
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.user_roles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role public.tv_role NOT NULL DEFAULT 'viewer'
);
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 name text NOT NULL, category text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 deleted_at timestamptz, acl_revision bigint NOT NULL DEFAULT 1,
 lifecycle text NOT NULL DEFAULT 'metadata_draft' CHECK (lifecycle='metadata_draft')
);
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.document_grants (
 document_id uuid NOT NULL REFERENCES public.documents(id), user_id uuid NOT NULL REFERENCES public.profiles(user_id),
 permission text NOT NULL CHECK(permission IN ('read','edit')), PRIMARY KEY(document_id,user_id)
);
GRANT ALL ON public.document_grants TO service_role;
ALTER TABLE public.document_grants ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES public.documents(id),
 version_number integer NOT NULL, quarantine_state text NOT NULL DEFAULT 'no_file' CHECK(quarantine_state='no_file'),
 UNIQUE(document_id,version_number)
);
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.audit_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL,
 actor_id uuid, document_id uuid, action text NOT NULL, outcome text NOT NULL CHECK(outcome IN ('allowed','denied')),
 reason text NOT NULL, previous_hash text NOT NULL, event_hash text NOT NULL, canonical text NOT NULL
);
GRANT SELECT,INSERT ON public.audit_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.audit_events_sequence_seq TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles,public.user_roles,public.documents,public.document_grants,public.document_versions,public.audit_events FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.tv_provision_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.profiles(user_id) VALUES(NEW.id);
 INSERT INTO public.user_roles(user_id,role) VALUES(NEW.id,'viewer');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tv_provision_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tv_account_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.tv_provision_profile();
INSERT INTO public.profiles(user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles(user_id,role) SELECT id,'viewer'::public.tv_role FROM auth.users ON CONFLICT DO NOTHING;

CREATE FUNCTION public.tv_immutable_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.id <> OLD.id OR NEW.owner_id <> OLD.owner_id THEN RAISE EXCEPTION 'Immutable identity'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tv_immutable_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tv_owner_immutable BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.tv_immutable_owner();
CREATE FUNCTION public.tv_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Append-only audit'; END $$;
REVOKE ALL ON FUNCTION public.tv_audit_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tv_audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_events FOR EACH STATEMENT EXECUTE FUNCTION public.tv_audit_immutable();

CREATE FUNCTION public.tv_append_audit(a uuid,d uuid,act text,result text,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE prev text; stamp timestamptz:=clock_timestamp(); body text;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT event_hash INTO prev FROM public.audit_events ORDER BY sequence DESC LIMIT 1;
 prev:=coalesce(prev,repeat('0',64));
 body:=jsonb_build_array(stamp,a,d,act,result,why)::text;
 INSERT INTO public.audit_events(at,actor_id,document_id,action,outcome,reason,previous_hash,event_hash,canonical)
 VALUES(stamp,a,d,act,result,why,prev,encode(sha256(convert_to(prev||body,'UTF8')),'hex'),body);
END $$;
REVOKE ALL ON FUNCTION public.tv_append_audit(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.tv_operation(action text,payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 actor uuid:=auth.uid(); sid uuid; account public.profiles; current_role public.tv_role; doc public.documents;
 docid uuid; target uuid; perm text; result jsonb; allowed_keys text[]; status integer:=200; reason text;
 lower_date timestamptz; upper_date timestamptz; lim integer; skip integer;
BEGIN
 -- A single phase-one transaction mutex serializes ACL decisions, reads, mutations and audit append.
 PERFORM pg_advisory_xact_lock(81437291);
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN sid:=NULL; END;
 IF actor IS NULL OR sid IS NULL OR coalesce((auth.jwt()->>'exp')::numeric,0)<=extract(epoch FROM clock_timestamp()) THEN reason:='invalid_session';
 ELSE
   PERFORM 1 FROM auth.sessions WHERE id=sid AND user_id=actor AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
   IF NOT FOUND THEN reason:='revoked_session'; END IF;
   PERFORM 1 FROM auth.users WHERE id=actor AND deleted_at IS NULL AND NOT is_anonymous AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
   IF NOT FOUND THEN reason:='disabled_identity'; END IF;
   SELECT * INTO account FROM public.profiles WHERE user_id=actor FOR SHARE;
   IF NOT FOUND OR NOT account.active THEN reason:='inactive_account'; END IF;
   SELECT role INTO current_role FROM public.user_roles WHERE user_id=actor FOR SHARE;
   IF current_role IS NULL THEN reason:='missing_role'; END IF;
 END IF;
 IF reason IS NOT NULL THEN
   PERFORM public.tv_append_audit(actor,NULL,coalesce(action,'invalid'),'denied',reason);
   RETURN jsonb_build_object('status',401,'error','Authentication required');
 END IF;
 allowed_keys:=CASE action
 WHEN 'identity' THEN ARRAY[]::text[]
 WHEN 'list' THEN ARRAY['scope','q','owner','category','from','to','limit','offset']
 WHEN 'create' THEN ARRAY['name','category']
 WHEN 'detail' THEN ARRAY['id'] WHEN 'grants' THEN ARRAY['id'] WHEN 'activity' THEN ARRAY['id','limit','offset']
 WHEN 'edit' THEN ARRAY['id','revision','name','category'] WHEN 'delete' THEN ARRAY['id','revision']
 WHEN 'grant' THEN ARRAY['id','revision','user_id','permission'] WHEN 'revoke' THEN ARRAY['id','revision','user_id']
 WHEN 'admin_activity' THEN ARRAY['limit','offset'] ELSE NULL END;
 IF allowed_keys IS NULL OR jsonb_typeof(payload)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k=ANY(allowed_keys)) THEN
   PERFORM public.tv_append_audit(actor,NULL,coalesce(action,'invalid'),'denied','invalid_parameters');
   RETURN jsonb_build_object('status',400,'error','Invalid request');
 END IF;
 BEGIN
   docid:=(payload->>'id')::uuid; target:=(payload->>'user_id')::uuid;
   lim:=coalesce((payload->>'limit')::integer,50); skip:=coalesce((payload->>'offset')::integer,0);
   lower_date:=(payload->>'from')::timestamptz; upper_date:=(payload->>'to')::timestamptz;
   IF lim<1 OR lim>100 OR skip<0 OR skip>10000 OR lower_date>upper_date THEN RAISE EXCEPTION 'range'; END IF;
   IF action IN ('edit','delete','grant','revoke') AND (payload->>'revision')::bigint IS NULL THEN RAISE EXCEPTION 'revision'; END IF;
 EXCEPTION WHEN OTHERS THEN
   PERFORM public.tv_append_audit(actor,NULL,action,'denied','invalid_parameters');
   RETURN jsonb_build_object('status',400,'error','Invalid request');
 END;
 IF action='identity' THEN
   result:=jsonb_build_object('id',actor,'display_name',account.display_name,'role',current_role);
 ELSIF action='list' THEN
   IF coalesce(payload->>'scope','all') NOT IN ('all','owned','shared') THEN reason:='invalid_parameters'; status:=400;
   ELSE
     SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM (
       SELECT d.*,CASE WHEN d.owner_id=actor THEN 'owner' ELSE g.permission END AS access
       FROM public.documents d LEFT JOIN public.document_grants g ON g.document_id=d.id AND g.user_id=actor
       WHERE d.deleted_at IS NULL AND (d.owner_id=actor OR g.permission IS NOT NULL)
       AND (coalesce(payload->>'scope','all')='all' OR (payload->>'scope'='owned' AND d.owner_id=actor) OR (payload->>'scope'='shared' AND d.owner_id<>actor))
       AND (payload->>'q' IS NULL OR strpos(lower(d.name),lower(left(payload->>'q',200)))>0)
       AND (payload->>'owner' IS NULL OR d.owner_id::text=payload->>'owner')
       AND (payload->>'category' IS NULL OR d.category=payload->>'category')
       AND (lower_date IS NULL OR d.created_at>=lower_date) AND (upper_date IS NULL OR d.created_at<=upper_date)
       ORDER BY d.created_at DESC,d.id LIMIT lim OFFSET skip
     ) t;
   END IF;
 ELSIF action='create' THEN
   IF current_role<>'document_creator' THEN reason:='creator_required'; status:=404;
   ELSIF coalesce(length(btrim(payload->>'name')),0) NOT BETWEEN 1 AND 200 OR length(coalesce(payload->>'category',''))>100 THEN reason:='invalid_parameters'; status:=400;
   ELSE
     INSERT INTO public.documents(owner_id,name,category) VALUES(actor,btrim(payload->>'name'),coalesce(payload->>'category','')) RETURNING * INTO doc;
     docid:=doc.id; result:=to_jsonb(doc)||jsonb_build_object('access','owner');
   END IF;
 ELSIF action='admin_activity' THEN
   IF current_role<>'administrator' THEN reason:='administrator_required'; status:=404;
   ELSE
     SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM (SELECT sequence,at,actor_id,document_id,action,outcome FROM public.audit_events ORDER BY sequence DESC LIMIT lim OFFSET skip) t;
   END IF;
 ELSE
   SELECT * INTO doc FROM public.documents WHERE id=docid FOR UPDATE;
   SELECT permission INTO perm FROM public.document_grants WHERE document_id=docid AND user_id=actor;
   IF doc.id IS NULL OR doc.deleted_at IS NOT NULL OR (doc.owner_id<>actor AND perm IS NULL) THEN reason:='missing_or_ungranted'; status:=404;
   ELSIF action IN ('delete','grant','revoke','grants','activity') AND doc.owner_id<>actor THEN reason:='owner_required'; status:=404;
   ELSIF action='edit' AND doc.owner_id<>actor AND perm<>'edit' THEN reason:='edit_required'; status:=404;
   ELSIF action IN ('edit','delete','grant','revoke') AND doc.acl_revision<>(payload->>'revision')::bigint THEN reason:='stale_revision'; status:=409;
   ELSIF action='detail' THEN result:=to_jsonb(doc)||jsonb_build_object('access',CASE WHEN doc.owner_id=actor THEN 'owner' ELSE perm END);
   ELSIF action='grants' THEN
     SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) INTO result FROM public.document_grants g WHERE g.document_id=docid;
   ELSIF action='activity' THEN
     SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM (SELECT sequence,at,actor_id,document_id,action,outcome FROM public.audit_events WHERE document_id=docid ORDER BY sequence DESC LIMIT lim OFFSET skip) t;
   ELSIF action='edit' THEN
     IF (payload ? 'name' AND coalesce(length(btrim(payload->>'name')),0) NOT BETWEEN 1 AND 200) OR (payload ? 'category' AND (payload->>'category' IS NULL OR length(payload->>'category')>100)) THEN reason:='invalid_parameters'; status:=400;
     ELSE UPDATE public.documents SET name=CASE WHEN payload ? 'name' THEN btrim(payload->>'name') ELSE name END,category=coalesce(payload->>'category',category),updated_at=clock_timestamp(),acl_revision=acl_revision+1 WHERE id=docid RETURNING * INTO doc; result:=to_jsonb(doc); END IF;
   ELSIF action='delete' THEN
     UPDATE public.documents SET deleted_at=clock_timestamp(),updated_at=clock_timestamp(),acl_revision=acl_revision+1 WHERE id=docid; result:=jsonb_build_object('deleted',true);
   ELSIF action IN ('grant','revoke') THEN
     IF target IS NULL OR target=doc.owner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=target AND active) OR (action='grant' AND coalesce(payload->>'permission','') NOT IN ('read','edit')) THEN reason:='invalid_target'; status:=400;
     ELSE
       IF action='grant' THEN INSERT INTO public.document_grants(document_id,user_id,permission) VALUES(docid,target,payload->>'permission') ON CONFLICT(document_id,user_id) DO UPDATE SET permission=excluded.permission;
       ELSE DELETE FROM public.document_grants WHERE document_id=docid AND user_id=target; END IF;
       UPDATE public.documents SET acl_revision=acl_revision+1,updated_at=clock_timestamp() WHERE id=docid RETURNING * INTO doc;
       result:=jsonb_build_object('revision',doc.acl_revision);
     END IF;
   END IF;
 END IF;
 IF reason IS NOT NULL THEN
   PERFORM public.tv_append_audit(actor,docid,action,'denied',reason);
   RETURN jsonb_build_object('status',status,'error',CASE status WHEN 404 THEN 'Not found' WHEN 409 THEN 'Refresh and retry' ELSE 'Invalid request' END);
 END IF;
 PERFORM public.tv_append_audit(actor,docid,action,'allowed','authorized');
 RETURN jsonb_build_object('status',200,'data',result);
END $$;
REVOKE ALL ON FUNCTION public.tv_operation(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tv_operation(text,jsonb) TO authenticated;
CREATE INDEX tv_documents_owner ON public.documents(owner_id,created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX tv_grants_user ON public.document_grants(user_id,document_id);
CREATE INDEX tv_audit_doc ON public.audit_events(document_id,sequence DESC);
