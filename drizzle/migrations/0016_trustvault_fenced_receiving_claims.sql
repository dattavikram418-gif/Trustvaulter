-- Exclusive fenced receiving claims: one claim per reservation, acquired BEFORE any body read.
-- Occupancy covers the whole buffered/store/readback/scan/finalise pipeline and is only freed by
-- the fenced worker's release or an explicit operator recovery after attested worker termination.
CREATE TABLE public.upload_receiving_claims(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reservation_id uuid NOT NULL UNIQUE REFERENCES public.upload_reservations(id),
 actor_id uuid NOT NULL,
 session_id uuid NOT NULL,
 fence_hash text NOT NULL,
 state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','released','recovered')),
 acquired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_until timestamptz NOT NULL,
 released_at timestamptz,
 release_outcome text
);
CREATE INDEX upload_receiving_claims_active ON public.upload_receiving_claims(actor_id) WHERE state='active';
REVOKE ALL ON public.upload_receiving_claims FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.upload_receiving_claims ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.upload_receiving_claims IS 'Service-function-only receiving claims. Fence stored as SHA-256 only. Active rows (including expired leases) occupy pipeline capacity until fenced release or operator recovery.';

CREATE FUNCTION public.tv_upload_envelope(why text,req uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('status',s,'error',CASE s WHEN 401 THEN 'Authentication required' WHEN 404 THEN 'Not found' WHEN 409 THEN 'Refresh and retry' WHEN 429 THEN 'Upload capacity busy' WHEN 503 THEN 'Upload capacity busy' ELSE 'Upload rejected' END,'request_id',req)
 FROM (SELECT CASE why WHEN 'invalid_session' THEN 401 WHEN 'not_found' THEN 404 WHEN 'invalid_claim' THEN 404 WHEN 'stale_revision' THEN 409 WHEN 'actor_pipeline_cap' THEN 429 WHEN 'global_pipeline_cap' THEN 429 WHEN 'process_pipeline_cap' THEN 503 ELSE 400 END s) x
$$;

CREATE FUNCTION public.tv_upload_claim(ticket_id uuid,caller uuid,caller_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.upload_reservations; why text; req uuid:=gen_random_uuid(); verified boolean; fence uuid:=gen_random_uuid(); cid uuid; audit_doc uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 verified:=public.tv_bridge_identity(caller,caller_session);
 IF NOT verified THEN why:='invalid_session';
 ELSE
  SELECT * INTO t FROM public.upload_reservations WHERE id=ticket_id FOR UPDATE;
  IF t.id IS NULL OR t.actor_id IS DISTINCT FROM caller OR t.session_id IS DISTINCT FROM caller_session THEN why:='not_found';
  ELSE
   why:=public.tv_upload_access(caller,caller_session,t.document_id,t.expected_revision,true);
   IF why IS NULL THEN
    audit_doc:=t.document_id;
    IF t.state<>'reserved' OR t.expires_at<=clock_timestamp() THEN why:='invalid_reservation';
    ELSIF EXISTS(SELECT 1 FROM public.upload_receiving_claims c WHERE c.reservation_id=t.id) THEN why:='receiving_claimed';
    ELSIF (SELECT count(*) FROM public.upload_receiving_claims c WHERE c.state='active' AND c.actor_id=caller)>=1 THEN why:='actor_pipeline_cap';
    ELSIF (SELECT count(*) FROM public.upload_receiving_claims c WHERE c.state='active')>=4 THEN why:='global_pipeline_cap';
    END IF;
   END IF;
  END IF;
 END IF;
 IF why IS NULL THEN
  INSERT INTO public.upload_receiving_claims(reservation_id,actor_id,session_id,fence_hash,lease_until)
  VALUES(t.id,caller,caller_session,encode(sha256(convert_to(fence::text,'UTF8')),'hex'),clock_timestamp()+interval '5 minutes') RETURNING id INTO cid;
 END IF;
 -- Denials never mutate the reservation or any existing (winning) claim.
 PERFORM public.tv_append_audit_v2(CASE WHEN verified THEN caller END,audit_doc,'upload_claim',CASE WHEN why IS NULL THEN 'allowed' ELSE 'denied' END,coalesce(why,'receiving_claimed_exclusive'),CASE WHEN verified THEN caller_session END,req,CASE WHEN cid IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('reservation_id',t.id,'claim_id',cid) END);
 IF why IS NOT NULL THEN RETURN public.tv_upload_envelope(why,req); END IF;
 RETURN jsonb_build_object('status',200,'request_id',req,'data',jsonb_build_object('claim_id',cid,'fence',fence));
END $$;

-- Returns the claim only when active, fence-matching, identity-matching and (optionally) inside its lease.
CREATE FUNCTION public.tv_upload_claim_valid(cid uuid,fence uuid,caller uuid,caller_session uuid,require_lease boolean) RETURNS public.upload_receiving_claims LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.upload_receiving_claims;
BEGIN
 SELECT * INTO c FROM public.upload_receiving_claims WHERE id=cid FOR UPDATE;
 IF c.id IS NULL OR fence IS NULL OR c.state<>'active' OR c.fence_hash<>encode(sha256(convert_to(fence::text,'UTF8')),'hex')
  OR c.actor_id IS DISTINCT FROM caller OR c.session_id IS DISTINCT FROM caller_session
  OR (require_lease AND c.lease_until<=clock_timestamp()) THEN RETURN NULL; END IF;
 RETURN c;
END $$;

CREATE FUNCTION public.tv_upload_fenced_denial(caller uuid,caller_session uuid,step text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE req uuid:=gen_random_uuid(); verified boolean:=public.tv_bridge_identity(caller,caller_session);
BEGIN
 PERFORM public.tv_append_audit_v2(CASE WHEN verified THEN caller END,NULL,'upload_'||step,'denied','invalid_claim',CASE WHEN verified THEN caller_session END,req,'{}'::jsonb);
 RETURN public.tv_upload_envelope('invalid_claim',req);
END $$;

CREATE FUNCTION public.tv_upload_stage_fenced(cid uuid,fence uuid,caller uuid,caller_session uuid,hash text,size integer,media text,safe_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.upload_receiving_claims;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 c:=public.tv_upload_claim_valid(cid,fence,caller,caller_session,true);
 IF c.id IS NULL THEN RETURN public.tv_upload_fenced_denial(caller,caller_session,'stage'); END IF;
 RETURN public.tv_upload_transition(c.reservation_id,caller,caller_session,'stage',hash,size,media,safe_name);
END $$;

CREATE FUNCTION public.tv_upload_finish_fenced(cid uuid,fence uuid,caller uuid,caller_session uuid,scan_verdict text,scan_result jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.upload_receiving_claims;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 c:=public.tv_upload_claim_valid(cid,fence,caller,caller_session,true);
 IF c.id IS NULL THEN RETURN public.tv_upload_fenced_denial(caller,caller_session,'finish'); END IF;
 RETURN public.tv_upload_finish_evidenced(c.reservation_id,caller,caller_session,scan_verdict,scan_result);
END $$;

-- Valid fence may fail its own reservation even after lease expiry; never another claimant's.
CREATE FUNCTION public.tv_upload_fail_fenced(cid uuid,fence uuid,caller uuid,caller_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.upload_receiving_claims;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 c:=public.tv_upload_claim_valid(cid,fence,caller,caller_session,false);
 IF c.id IS NULL THEN RETURN public.tv_upload_fenced_denial(caller,caller_session,'fail'); END IF;
 RETURN public.tv_upload_transition(c.reservation_id,caller,caller_session,'fail');
END $$;

-- Idempotent fenced release; required audit failure leaves the slot occupied (fail closed).
CREATE FUNCTION public.tv_upload_release_fenced(cid uuid,fence uuid,outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.upload_receiving_claims; req uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 IF outcome IS NULL OR outcome NOT IN ('finished','denied','malformed','stored_failure','scan_failure','aborted') THEN RAISE EXCEPTION 'Invalid release outcome'; END IF;
 SELECT * INTO c FROM public.upload_receiving_claims WHERE id=cid FOR UPDATE;
 IF c.id IS NULL OR fence IS NULL OR c.fence_hash<>encode(sha256(convert_to(fence::text,'UTF8')),'hex') THEN
  PERFORM public.tv_append_audit_v2(NULL,NULL,'upload_release','denied','invalid_claim',NULL,req,'{}'::jsonb);
  RETURN public.tv_upload_envelope('invalid_claim',req);
 END IF;
 IF c.state<>'active' THEN RETURN jsonb_build_object('status',200,'request_id',req,'data',jsonb_build_object('state',c.state)); END IF;
 UPDATE public.upload_receiving_claims SET state='released',released_at=clock_timestamp(),release_outcome=outcome WHERE id=cid;
 PERFORM public.tv_append_audit_v2(c.actor_id,NULL,'upload_release','allowed',outcome,c.session_id,req,jsonb_build_object('reservation_id',c.reservation_id,'claim_id',c.id));
 RETURN jsonb_build_object('status',200,'request_id',req,'data',jsonb_build_object('state','released'));
END $$;

CREATE FUNCTION public.tv_upload_admission_busy(caller uuid,caller_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE req uuid:=gen_random_uuid(); verified boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 verified:=public.tv_bridge_identity(caller,caller_session);
 PERFORM public.tv_append_audit_v2(CASE WHEN verified THEN caller END,NULL,'upload_claim','denied','process_pipeline_cap',CASE WHEN verified THEN caller_session END,req,'{}'::jsonb);
 RETURN public.tv_upload_envelope('process_pipeline_cap',req);
END $$;

-- Operator-only recovery after independently attested worker termination. Never automatic.
-- Only expired leases; fails the reservation so finalisation is impossible and recurring cleanup
-- reconciles any late external write. The reservation can never be claimed again.
CREATE FUNCTION public.tv_upload_claim_recover(cid uuid,attestation text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.upload_receiving_claims; req uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 IF attestation IS DISTINCT FROM 'worker_terminated_verified' THEN RAISE EXCEPTION 'Termination attestation required'; END IF;
 SELECT * INTO c FROM public.upload_receiving_claims WHERE id=cid FOR UPDATE;
 IF c.id IS NULL OR c.state<>'active' OR c.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'Claim not recoverable'; END IF;
 UPDATE public.upload_receiving_claims SET state='recovered',released_at=clock_timestamp(),release_outcome='operator_recovered' WHERE id=cid;
 UPDATE public.upload_reservations SET state='failed' WHERE id=c.reservation_id AND state IN ('reserved','staged');
 PERFORM public.tv_append_audit_v2(NULL,NULL,'upload_claim_recover','allowed','operator_attested_termination',NULL,req,jsonb_build_object('reservation_id',c.reservation_id,'claim_id',c.id));
 RETURN jsonb_build_object('status',200,'request_id',req);
END $$;

-- Unfenced mutators are no longer reachable by the service bridge; fenced wrappers call them as owner.
REVOKE ALL ON FUNCTION public.tv_upload_transition(uuid,uuid,uuid,text,text,integer,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tv_upload_finish_evidenced(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tv_upload_envelope(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tv_upload_claim_valid(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tv_upload_fenced_denial(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tv_upload_claim(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_upload_stage_fenced(uuid,uuid,uuid,uuid,text,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_upload_finish_fenced(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_upload_fail_fenced(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_upload_release_fenced(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_upload_admission_busy(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_upload_claim_recover(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_upload_claim(uuid,uuid,uuid),public.tv_upload_stage_fenced(uuid,uuid,uuid,uuid,text,integer,text,text),public.tv_upload_finish_fenced(uuid,uuid,uuid,uuid,text,jsonb),public.tv_upload_fail_fenced(uuid,uuid,uuid,uuid),public.tv_upload_release_fenced(uuid,uuid,text),public.tv_upload_admission_busy(uuid,uuid),public.tv_upload_claim_recover(uuid,text) TO service_role;
