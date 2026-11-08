CREATE FUNCTION public.tv_bridge_identity(a uuid,s uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 PERFORM 1 FROM auth.sessions WHERE id=s AND user_id=a AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE; IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM auth.users WHERE id=a AND deleted_at IS NULL AND NOT is_anonymous AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE; IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=a AND active FOR SHARE; IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=a FOR SHARE; RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.tv_bridge_identity(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.tv_upload_transition(ticket_id uuid,caller uuid,caller_session uuid,step text,hash text DEFAULT NULL,size integer DEFAULT NULL,media text DEFAULT NULL,safe_name text DEFAULT NULL,verdict text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.upload_reservations; why text; req uuid:=gen_random_uuid(); vid uuid; evidence jsonb:='{}'::jsonb; status integer:=200; verified boolean; authorized boolean:=false; audit_doc uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 verified:=public.tv_bridge_identity(caller,caller_session);
 IF NOT verified THEN why:='invalid_session';
 ELSE
  SELECT * INTO t FROM public.upload_reservations WHERE id=ticket_id FOR UPDATE;
  IF t.id IS NULL OR t.actor_id IS DISTINCT FROM caller OR t.session_id IS DISTINCT FROM caller_session THEN why:='not_found'; t:=NULL;
  ELSE
   why:=public.tv_upload_access(caller,caller_session,t.document_id,t.expected_revision,true);
   authorized:=why IS NULL;
   IF authorized THEN
    audit_doc:=t.document_id;
    IF t.expires_at<=clock_timestamp() OR t.state NOT IN ('reserved','staged') THEN why:='invalid_reservation'; END IF;
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
  END IF;
 END IF;
 IF why IS NOT NULL THEN status:=CASE why WHEN 'invalid_session' THEN 401 WHEN 'not_found' THEN 404 WHEN 'stale_revision' THEN 409 ELSE 400 END; END IF;
 PERFORM public.tv_append_audit_v2(CASE WHEN verified THEN caller ELSE NULL END,audit_doc,'upload_'||coalesce(step,'invalid'),CASE WHEN why IS NULL THEN 'allowed' ELSE 'denied' END,coalesce(why,'quarantined'),CASE WHEN verified THEN caller_session ELSE NULL END,req,evidence);
 RETURN CASE WHEN why IS NULL THEN jsonb_build_object('status',200,'data',jsonb_build_object('object_key',t.object_key,'version_id',vid,'quarantine_state','quarantined'),'request_id',req) ELSE jsonb_build_object('status',status,'error',CASE status WHEN 401 THEN 'Authentication required' WHEN 404 THEN 'Not found' WHEN 409 THEN 'Refresh and retry' ELSE 'Upload rejected' END,'request_id',req) END;
END $$;
REVOKE ALL ON FUNCTION public.tv_upload_transition(uuid,uuid,uuid,text,text,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_upload_transition(uuid,uuid,uuid,text,text,integer,text,text,text) TO service_role;
CREATE TABLE public.quarantine_cleanup_intents(
 reservation_id uuid PRIMARY KEY REFERENCES public.upload_reservations(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), claim_id uuid, claim_until timestamptz, attempts integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.quarantine_cleanup_intents TO service_role;
REVOKE ALL ON public.quarantine_cleanup_intents FROM service_role,anon,authenticated;
ALTER TABLE public.quarantine_cleanup_intents ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.quarantine_cleanup_attempts(
 id uuid PRIMARY KEY, reservation_id uuid NOT NULL REFERENCES public.quarantine_cleanup_intents(reservation_id),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), claim_until timestamptz NOT NULL, finished_at timestamptz,
 outcome text CHECK(outcome IN ('storage_success','storage_error')), intent_request_id uuid NOT NULL, receipt_request_id uuid
);
GRANT ALL ON public.quarantine_cleanup_attempts TO service_role;
REVOKE ALL ON public.quarantine_cleanup_attempts FROM service_role,anon,authenticated;
ALTER TABLE public.quarantine_cleanup_attempts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.tv_quarantine_cleanup_candidates(maximum integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF maximum IS NULL OR maximum NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid bound'; END IF;
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM (
 SELECT r.id,r.object_key,r.document_id FROM public.upload_reservations r LEFT JOIN public.quarantine_cleanup_intents i ON i.reservation_id=r.id
 WHERE r.version_id IS NULL AND r.digest IS NOT NULL AND (r.state='failed' OR (r.state='staged' AND r.expires_at<clock_timestamp()-interval '5 minutes'))
 AND NOT EXISTS(SELECT 1 FROM public.quarantined_versions v WHERE v.reservation_id=r.id OR v.object_key=r.object_key)
 AND i.completed_at IS NULL AND (i.claim_until IS NULL OR i.claim_until<=clock_timestamp()) AND (i.next_attempt_at IS NULL OR i.next_attempt_at<=clock_timestamp())
 ORDER BY coalesce(i.next_attempt_at,r.expires_at),r.id LIMIT maximum) t;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tv_quarantine_cleanup_candidates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_quarantine_cleanup_candidates(integer) TO service_role;
CREATE FUNCTION public.tv_quarantine_cleanup_claim(maximum integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE candidate jsonb; cid uuid; req uuid; until_at timestamptz; result jsonb:='[]'::jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 FOR candidate IN SELECT value FROM jsonb_array_elements(public.tv_quarantine_cleanup_candidates(maximum)) LOOP
  cid:=gen_random_uuid();req:=gen_random_uuid();until_at:=clock_timestamp()+interval '5 minutes';
  INSERT INTO public.quarantine_cleanup_intents(reservation_id) VALUES((candidate->>'id')::uuid) ON CONFLICT DO NOTHING;
  UPDATE public.quarantine_cleanup_intents SET claim_id=cid,claim_until=until_at,attempts=attempts+1 WHERE reservation_id=(candidate->>'id')::uuid;
  UPDATE public.upload_reservations SET state='failed' WHERE id=(candidate->>'id')::uuid;
  INSERT INTO public.quarantine_cleanup_attempts(id,reservation_id,claim_until,intent_request_id) VALUES(cid,(candidate->>'id')::uuid,until_at,req);
  PERFORM public.tv_append_audit_v2(NULL,NULL,'cleanup_intent','allowed','trusted_maintenance',NULL,req,jsonb_build_object('reservation_id',candidate->>'id','attempt_id',cid));
  result:=result||jsonb_build_array(jsonb_build_object('claim_id',cid,'object_key',candidate->>'object_key','request_id',req));
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tv_quarantine_cleanup_claim(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_quarantine_cleanup_claim(integer) TO service_role;
CREATE FUNCTION public.tv_quarantine_cleanup_receipt(claim uuid,outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE attempt public.quarantine_cleanup_attempts; intent public.quarantine_cleanup_intents; req uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 IF outcome IS NULL OR outcome NOT IN ('storage_success','storage_error') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 SELECT * INTO attempt FROM public.quarantine_cleanup_attempts WHERE id=claim FOR UPDATE;
 IF attempt.id IS NULL THEN RAISE EXCEPTION 'Unknown claim'; END IF;
 IF attempt.finished_at IS NOT NULL THEN
  IF attempt.outcome<>outcome THEN RAISE EXCEPTION 'Conflicting receipt'; END IF;
  RETURN jsonb_build_object('request_id',attempt.receipt_request_id,'outcome',attempt.outcome);
 END IF;
 SELECT * INTO intent FROM public.quarantine_cleanup_intents WHERE reservation_id=attempt.reservation_id FOR UPDATE;
 IF intent.claim_id IS DISTINCT FROM claim OR intent.claim_until<=clock_timestamp() THEN RAISE EXCEPTION 'Expired claim'; END IF;
 PERFORM public.tv_append_audit_v2(NULL,NULL,'cleanup_receipt',CASE WHEN outcome='storage_success' THEN 'allowed' ELSE 'denied' END,outcome,NULL,req,jsonb_build_object('reservation_id',attempt.reservation_id,'attempt_id',claim,'storage_outcome',outcome));
 UPDATE public.quarantine_cleanup_attempts SET finished_at=clock_timestamp(),outcome=tv_quarantine_cleanup_receipt.outcome,receipt_request_id=req WHERE id=claim;
 UPDATE public.quarantine_cleanup_intents SET completed_at=CASE WHEN outcome='storage_success' THEN clock_timestamp() ELSE NULL END,claim_id=NULL,claim_until=NULL,next_attempt_at=clock_timestamp()+interval '1 minute' WHERE reservation_id=attempt.reservation_id;
 RETURN jsonb_build_object('request_id',req,'outcome',outcome);
END $$;
REVOKE ALL ON FUNCTION public.tv_quarantine_cleanup_receipt(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_quarantine_cleanup_receipt(uuid,text) TO service_role;
COMMENT ON FUNCTION public.tv_quarantine_cleanup_candidates(integer) IS 'Dry-run only; excludes completed and successful versions. Apply requires durable claim then storage result receipt. No atomic storage/DB guarantee.';
