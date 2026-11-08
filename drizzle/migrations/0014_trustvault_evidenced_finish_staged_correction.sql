CREATE OR REPLACE FUNCTION public.tv_upload_finish_evidenced(ticket_id uuid,caller uuid,caller_session uuid,scan_verdict text,scan_result jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.upload_reservations; result jsonb; parsed jsonb; body text; sig text; evidence jsonb; eid uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); stamp timestamptz:=clock_timestamp(); eh text;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT * INTO t FROM public.upload_reservations WHERE id=ticket_id FOR UPDATE;
 IF NOT public.tv_bridge_identity(caller,caller_session) OR t.id IS NULL OR t.actor_id IS DISTINCT FROM caller OR t.session_id IS DISTINCT FROM caller_session THEN RETURN public.tv_upload_transition(ticket_id,caller,caller_session,'inspect'); END IF;
 IF public.tv_upload_access(caller,caller_session,t.document_id,t.expected_revision,true) IS NOT NULL THEN RETURN public.tv_upload_transition(ticket_id,caller,caller_session,'inspect'); END IF;
 IF scan_verdict IS NULL OR scan_verdict NOT IN ('missing','error','malicious','clean') THEN RAISE EXCEPTION 'Invalid scan evidence'; END IF;
 IF scan_result IS NOT NULL THEN
  IF jsonb_typeof(scan_result)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(scan_result))<>2 OR NOT(scan_result ? 'body' AND scan_result ? 'signature') THEN RAISE EXCEPTION 'Invalid scan evidence'; END IF;
  body:=scan_result->>'body'; sig:=scan_result->>'signature';
  IF body IS NULL OR octet_length(body) NOT BETWEEN 1 AND 4096 OR sig IS NULL OR sig !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid scan evidence'; END IF;
  parsed:=body::jsonb;
  IF jsonb_typeof(parsed)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(parsed))<>6 OR NOT(parsed ?& ARRAY['digest','size','nonce','verdict','engine','signature_version']) OR EXISTS(SELECT 1 FROM jsonb_each(parsed) e WHERE (e.key='size' AND jsonb_typeof(e.value)<>'number') OR (e.key<>'size' AND jsonb_typeof(e.value)<>'string')) THEN RAISE EXCEPTION 'Invalid scan evidence'; END IF;
  IF parsed->>'digest' IS DISTINCT FROM t.digest OR (parsed->>'size')::integer IS DISTINCT FROM t.byte_size OR parsed->>'verdict' IS DISTINCT FROM scan_verdict OR scan_verdict NOT IN ('clean','malicious') OR length(parsed->>'engine') NOT BETWEEN 1 AND 100 OR length(parsed->>'signature_version') NOT BETWEEN 1 AND 100 OR parsed->>'nonce' IS NULL THEN RAISE EXCEPTION 'Invalid scan evidence'; END IF;
 ELSE IF scan_verdict NOT IN ('missing','error') THEN RAISE EXCEPTION 'Signed scan evidence required'; END IF; END IF;
 result:=public.tv_upload_transition(ticket_id,caller,caller_session,'finish',t.digest,t.byte_size,t.mime,t.filename,scan_verdict);
 IF (result->>'status')::integer<>200 THEN RETURN result; END IF;
 evidence:=jsonb_build_object('version',1,'check_id',eid,'version_id',result->'data'->>'version_id','reservation_id',t.id,'document_id',t.document_id,'checked_at',stamp,'upload_request_id',result->>'request_id','verdict',scan_verdict,'digest',t.digest,'byte_size',t.byte_size,'signed_body',body,'response_signature',sig);
 eh:=encode(sha256(convert_to(evidence::text,'UTF8')),'hex');
 INSERT INTO public.quarantine_scan_checks(id,version_id,reservation_id,document_id,checked_at,upload_request_id,evidence_request_id,verdict,digest,byte_size,nonce,engine,signature_version,signed_body,response_signature,evidence_hash) VALUES(eid,(result->'data'->>'version_id')::uuid,t.id,t.document_id,stamp,(result->>'request_id')::uuid,req,scan_verdict,t.digest,t.byte_size,(parsed->>'nonce')::uuid,parsed->>'engine',parsed->>'signature_version',body,sig,eh);
 PERFORM public.tv_append_audit_v2(caller,t.document_id,'upload_scan_check','allowed','retained_quarantined',caller_session,req,jsonb_build_object('check_id',eid,'version_id',result->'data'->>'version_id','upload_request_id',result->>'request_id','evidence_hash',eh));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tv_upload_finish_evidenced(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_upload_finish_evidenced(uuid,uuid,uuid,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.tv_upload_finish_evidenced(uuid,uuid,uuid,text,jsonb) IS 'Trusted bridge must verify HMAC/nonce before invocation. Private bounded evidence and upload finish commit together. No promotion or delivery. Legacy transition remains trusted-only for historical callers.';
