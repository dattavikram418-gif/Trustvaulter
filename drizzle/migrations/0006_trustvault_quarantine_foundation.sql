CREATE TABLE public.upload_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES public.documents(id),
 actor_id uuid NOT NULL, session_id uuid NOT NULL, expected_revision bigint NOT NULL,
 object_key text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text, expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes',
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','staged','quarantined','failed')),
 digest text, byte_size integer, mime text, filename text, version_id uuid
);
GRANT ALL ON public.upload_reservations TO service_role;
REVOKE ALL ON public.upload_reservations FROM service_role,anon,authenticated;
ALTER TABLE public.upload_reservations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.quarantined_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES public.documents(id),
 reservation_id uuid NOT NULL UNIQUE REFERENCES public.upload_reservations(id), version_number integer NOT NULL,
 object_key text NOT NULL UNIQUE, digest text NOT NULL, byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
 mime text NOT NULL, filename text NOT NULL, scan_evidence text NOT NULL CHECK(scan_evidence IN ('missing','error','malicious','clean')),
 quarantine_state text NOT NULL DEFAULT 'quarantined' CHECK(quarantine_state='quarantined'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(document_id,version_number)
);
GRANT ALL ON public.quarantined_versions TO service_role;
REVOKE ALL ON public.quarantined_versions FROM service_role,anon,authenticated;
ALTER TABLE public.quarantined_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tv_quarantine_deny ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated USING(bucket_id <> 'trustvault-quarantine') WITH CHECK(bucket_id <> 'trustvault-quarantine');
CREATE FUNCTION public.tv_upload_access(a uuid,s uuid,d uuid,rev bigint,write_access boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE doc public.documents; perm text; role public.tv_role;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 PERFORM 1 FROM auth.sessions WHERE id=s AND user_id=a AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RETURN 'invalid_session'; END IF;
 PERFORM 1 FROM auth.users WHERE id=a AND deleted_at IS NULL AND NOT is_anonymous AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RETURN 'invalid_session'; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=a AND active FOR SHARE;
 IF NOT FOUND THEN RETURN 'invalid_session'; END IF;
 SELECT r.role INTO role FROM public.user_roles r WHERE user_id=a FOR SHARE;
 IF role IS NULL THEN RETURN 'invalid_session'; END IF;
 SELECT * INTO doc FROM public.documents WHERE id=d FOR UPDATE;
 SELECT permission INTO perm FROM public.document_grants WHERE document_id=d AND user_id=a;
 IF doc.id IS NULL OR doc.deleted_at IS NOT NULL OR (doc.owner_id<>a AND (perm IS NULL OR (write_access AND perm<>'edit'))) THEN RETURN 'not_found'; END IF;
 IF write_access AND (rev IS NULL OR doc.acl_revision<>rev) THEN RETURN 'stale_revision'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tv_upload_access(uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tv_upload_request(action text,payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a uuid:=auth.uid(); s uuid; d uuid; rev bigint; why text; req uuid:=gen_random_uuid(); status integer:=200; result jsonb; ticket public.upload_reservations;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 BEGIN s:=(auth.jwt()->>'session_id')::uuid; EXCEPTION WHEN OTHERS THEN s:=NULL; END;
 IF a IS NULL OR s IS NULL OR coalesce((auth.jwt()->>'exp')::numeric,0)<=extract(epoch FROM clock_timestamp()) THEN why:='invalid_session';
 ELSE
  BEGIN
   IF action NOT IN ('reserve','versions','read_attempt') OR payload IS NULL OR jsonb_typeof(payload)<>'object' OR octet_length(payload::text)>2048 OR EXISTS(SELECT 1 FROM jsonb_each(payload) e WHERE e.key NOT IN ('id','revision') OR jsonb_typeof(e.value) NOT IN ('string','number')) THEN RAISE EXCEPTION 'invalid'; END IF;
   d:=(payload->>'id')::uuid; rev:=(payload->>'revision')::bigint;
   why:=public.tv_upload_access(a,s,d,rev,action='reserve');
  EXCEPTION WHEN OTHERS THEN why:='invalid_parameters'; END;
 END IF;
 IF why IS NULL THEN
  IF action='reserve' THEN
   IF (SELECT count(*) FROM public.upload_reservations WHERE actor_id=a AND state IN ('reserved','staged') AND expires_at>clock_timestamp())>=5 THEN why:='reservation_limit';
   ELSE INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision) VALUES(d,a,s,rev) RETURNING * INTO ticket;
    UPDATE public.upload_reservations SET expires_at=least(expires_at,to_timestamp((auth.jwt()->>'exp')::numeric)) WHERE id=ticket.id;
    result:=jsonb_build_object('reservation_id',ticket.id); END IF;
  ELSIF action='versions' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) INTO result FROM (SELECT id,version_number,digest,byte_size,mime,filename,scan_evidence,quarantine_state,created_at FROM public.quarantined_versions WHERE document_id=d ORDER BY version_number DESC LIMIT 100) v;
  ELSE why:='delivery_gate_closed'; END IF;
 END IF;
 IF why IS NOT NULL THEN status:=CASE why WHEN 'invalid_session' THEN 401 WHEN 'not_found' THEN 404 WHEN 'stale_revision' THEN 409 WHEN 'delivery_gate_closed' THEN 423 ELSE 400 END; END IF;
 PERFORM public.tv_append_audit_v2(a,d,'upload_'||coalesce(action,'invalid'),CASE WHEN why IS NULL THEN 'allowed' ELSE 'denied' END,coalesce(why,'authorized'),CASE WHEN why='invalid_session' THEN NULL ELSE s END,req,CASE WHEN ticket.id IS NOT NULL THEN jsonb_build_object('reservation_id',ticket.id) ELSE '{}'::jsonb END);
 RETURN CASE WHEN why IS NULL THEN jsonb_build_object('status',200,'data',result,'request_id',req) ELSE jsonb_build_object('status',status,'error',CASE status WHEN 401 THEN 'Authentication required' WHEN 404 THEN 'Not found' WHEN 409 THEN 'Refresh and retry' WHEN 423 THEN 'Content delivery unavailable' ELSE 'Invalid request' END,'request_id',req) END;
END $$;
REVOKE ALL ON FUNCTION public.tv_upload_request(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tv_upload_request(text,jsonb) TO authenticated;
CREATE FUNCTION public.tv_upload_transition(ticket_id uuid,caller uuid,caller_session uuid,step text,hash text DEFAULT NULL,size integer DEFAULT NULL,media text DEFAULT NULL,safe_name text DEFAULT NULL,verdict text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.upload_reservations; why text; req uuid:=gen_random_uuid(); vid uuid; evidence jsonb:='{}'::jsonb; status integer:=200;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT * INTO t FROM public.upload_reservations WHERE id=ticket_id FOR UPDATE;
 IF t.id IS NULL OR t.actor_id IS DISTINCT FROM caller OR t.session_id IS DISTINCT FROM caller_session THEN why:='not_found'; t:=NULL;
 ELSE
  why:=public.tv_upload_access(t.actor_id,t.session_id,t.document_id,t.expected_revision,true);
  IF why IS NULL AND (t.expires_at<=clock_timestamp() OR t.state NOT IN ('reserved','staged')) THEN why:='invalid_reservation'; END IF;
  IF why IS NULL THEN
   IF step='stage' AND t.state='reserved' AND hash ~ '^[0-9a-f]{64}$' AND size BETWEEN 1 AND 10485760 AND media IN ('application/pdf','image/png','image/jpeg','text/plain') AND safe_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' THEN
    UPDATE public.upload_reservations SET state='staged',digest=hash,byte_size=size,mime=media,filename=safe_name WHERE id=t.id;
   ELSIF step='finish' AND t.state='staged' AND hash=t.digest AND size=t.byte_size AND media=t.mime AND safe_name=t.filename AND verdict IN ('missing','error','malicious','clean') THEN
    INSERT INTO public.quarantined_versions(document_id,reservation_id,version_number,object_key,digest,byte_size,mime,filename,scan_evidence)
    SELECT t.document_id,t.id,coalesce(max(version_number),0)+1,t.object_key,t.digest,t.byte_size,t.mime,t.filename,verdict FROM public.quarantined_versions WHERE document_id=t.document_id RETURNING id INTO vid;
    UPDATE public.upload_reservations SET state='quarantined',version_id=vid WHERE id=t.id;
    UPDATE public.documents SET lifecycle='quarantined',acl_revision=acl_revision+1,updated_at=clock_timestamp() WHERE id=t.document_id;
   ELSIF step='fail' THEN why:='upload_failed';
   ELSE why:='invalid_parameters'; END IF;
  END IF;
  evidence:=jsonb_build_object('reservation_id',t.id,'version_id',vid,'digest',coalesce(t.digest,hash),'byte_size',coalesce(t.byte_size,size),'scan_evidence',CASE WHEN vid IS NOT NULL THEN verdict ELSE NULL END);
  IF why IS NOT NULL AND t.state IN ('reserved','staged') THEN UPDATE public.upload_reservations SET state='failed' WHERE id=t.id; END IF;
 END IF;
 IF why IS NOT NULL THEN status:=CASE why WHEN 'invalid_session' THEN 401 WHEN 'not_found' THEN 404 WHEN 'stale_revision' THEN 409 ELSE 400 END; END IF;
 PERFORM public.tv_append_audit_v2(t.actor_id,t.document_id,'upload_'||coalesce(step,'invalid'),CASE WHEN why IS NULL THEN 'allowed' ELSE 'denied' END,coalesce(why,'quarantined'),CASE WHEN why='invalid_session' THEN NULL ELSE t.session_id END,req,evidence);
 RETURN CASE WHEN why IS NULL THEN jsonb_build_object('status',200,'data',jsonb_build_object('object_key',t.object_key,'version_id',vid,'quarantine_state','quarantined'),'request_id',req) ELSE jsonb_build_object('status',status,'error',CASE status WHEN 401 THEN 'Authentication required' WHEN 404 THEN 'Not found' WHEN 409 THEN 'Refresh and retry' ELSE 'Upload rejected' END,'request_id',req) END;
END $$;
REVOKE ALL ON FUNCTION public.tv_upload_transition(uuid,uuid,uuid,text,text,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_upload_transition(uuid,uuid,uuid,text,text,integer,text,text,text) TO service_role;
