CREATE OR REPLACE FUNCTION public.tv_upload_request(action text,payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a uuid:=auth.uid(); s uuid; d uuid; rev bigint; why text; req uuid:=gen_random_uuid(); status integer:=200; result jsonb; evidence jsonb:='{}'::jsonb; ticket public.upload_reservations;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 BEGIN s:=(auth.jwt()->>'session_id')::uuid; EXCEPTION WHEN OTHERS THEN s:=NULL; END;
 IF a IS NULL OR s IS NULL OR coalesce((auth.jwt()->>'exp')::numeric,0)<=extract(epoch FROM clock_timestamp()) THEN why:='invalid_session';
 ELSE
  why:=public.tv_upload_access(a,s,NULL,NULL,false);
  IF why='not_found' THEN why:=NULL; END IF;
  IF why IS NULL THEN
   BEGIN
    IF action NOT IN ('reserve','versions','read_attempt') OR payload IS NULL OR jsonb_typeof(payload)<>'object' OR octet_length(payload::text)>2048 OR EXISTS(SELECT 1 FROM jsonb_each(payload) e WHERE e.key NOT IN ('id','revision') OR jsonb_typeof(e.value) NOT IN ('string','number')) THEN RAISE EXCEPTION 'invalid'; END IF;
    d:=(payload->>'id')::uuid; rev:=(payload->>'revision')::bigint;
    why:=public.tv_upload_access(a,s,d,rev,action='reserve');
   EXCEPTION WHEN OTHERS THEN why:='invalid_parameters'; END;
  END IF;
 END IF;
 IF why IS NULL THEN
  IF action='reserve' THEN
   IF (SELECT count(*) FROM public.upload_reservations WHERE actor_id=a AND state IN ('reserved','staged') AND expires_at>clock_timestamp())>=5 THEN why:='reservation_limit';
   ELSE INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision) VALUES(d,a,s,rev) RETURNING * INTO ticket;
    UPDATE public.upload_reservations SET expires_at=least(expires_at,to_timestamp((auth.jwt()->>'exp')::numeric)) WHERE id=ticket.id;
    result:=jsonb_build_object('reservation_id',ticket.id); END IF;
  ELSIF action='versions' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) INTO result FROM (SELECT id,version_number,digest,byte_size,mime,filename,scan_evidence,quarantine_state,created_at FROM public.quarantined_versions WHERE document_id=d ORDER BY version_number DESC LIMIT 100) v;
  ELSE
   SELECT jsonb_build_object('version_id',v.id,'digest',v.digest,'byte_size',v.byte_size) INTO evidence FROM public.quarantined_versions v WHERE document_id=d ORDER BY version_number DESC LIMIT 1;
   evidence:=coalesce(evidence,'{}'::jsonb); why:='delivery_gate_closed';
  END IF;
 END IF;
 IF why IS NOT NULL THEN status:=CASE why WHEN 'invalid_session' THEN 401 WHEN 'not_found' THEN 404 WHEN 'stale_revision' THEN 409 WHEN 'delivery_gate_closed' THEN 423 ELSE 400 END; END IF;
 PERFORM public.tv_append_audit_v2(a,d,'upload_'||coalesce(action,'invalid'),CASE WHEN why IS NULL THEN 'allowed' ELSE 'denied' END,coalesce(why,'authorized'),CASE WHEN why='invalid_session' THEN NULL ELSE s END,req,CASE WHEN ticket.id IS NOT NULL THEN jsonb_build_object('reservation_id',ticket.id) ELSE evidence END);
 RETURN CASE WHEN why IS NULL THEN jsonb_build_object('status',200,'data',result,'request_id',req) ELSE jsonb_build_object('status',status,'error',CASE status WHEN 401 THEN 'Authentication required' WHEN 404 THEN 'Not found' WHEN 409 THEN 'Refresh and retry' WHEN 423 THEN 'Content delivery unavailable' ELSE 'Invalid request' END,'request_id',req) END;
END $$;
REVOKE ALL ON FUNCTION public.tv_upload_request(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tv_upload_request(text,jsonb) TO authenticated;
