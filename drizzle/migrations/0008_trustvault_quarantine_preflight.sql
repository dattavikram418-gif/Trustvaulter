CREATE OR REPLACE FUNCTION public.tv_upload_transition(ticket_id uuid,caller uuid,caller_session uuid,step text,hash text DEFAULT NULL,size integer DEFAULT NULL,media text DEFAULT NULL,safe_name text DEFAULT NULL,verdict text DEFAULT NULL) RETURNS jsonb
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
   IF step='inspect' AND t.state='reserved' THEN NULL;
   ELSIF step='stage' AND t.state='reserved' AND hash ~ '^[0-9a-f]{64}$' AND size BETWEEN 1 AND 10485760 AND media IN ('application/pdf','image/png','image/jpeg','text/plain') AND safe_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' THEN
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
CREATE FUNCTION public.tv_quarantine_cleanup_candidates(maximum integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF maximum NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid bound'; END IF;
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM (SELECT id,object_key,document_id FROM public.upload_reservations WHERE state='failed' OR (state IN ('reserved','staged') AND expires_at<clock_timestamp()-interval '5 minutes') ORDER BY expires_at LIMIT maximum) t;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tv_quarantine_cleanup_candidates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_quarantine_cleanup_candidates(integer) TO service_role;
