CREATE OR REPLACE FUNCTION public.tv_quarantine_cleanup_candidates(maximum integer DEFAULT 100) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF maximum IS NULL OR maximum NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid bound'; END IF;
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO result FROM (
 SELECT r.id,r.object_key,r.document_id FROM public.upload_reservations r LEFT JOIN public.quarantine_cleanup_intents i ON i.reservation_id=r.id
 WHERE r.version_id IS NULL AND r.digest IS NOT NULL AND (r.state='failed' OR (r.state='staged' AND r.expires_at<clock_timestamp()-interval '5 minutes'))
 AND NOT EXISTS(SELECT 1 FROM public.quarantined_versions v WHERE v.reservation_id=r.id OR v.object_key=r.object_key)
 AND (i.claim_until IS NULL OR i.claim_until<=clock_timestamp()) AND (i.next_attempt_at IS NULL OR i.next_attempt_at<=clock_timestamp())
 ORDER BY coalesce(i.attempts,0),coalesce(i.next_attempt_at,r.expires_at),r.id LIMIT maximum) t;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tv_quarantine_cleanup_candidates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_quarantine_cleanup_candidates(integer) TO service_role;
COMMENT ON FUNCTION public.tv_quarantine_cleanup_candidates(integer) IS 'Recurring least-attempted sweeps include historically completed unfinalised keys indefinitely. Delay is scheduling only, never a bound on external writes. Successful versions always excluded. Service-only dry-run.';
COMMENT ON COLUMN public.quarantine_cleanup_intents.completed_at IS 'Historical latest successful storage API receipt timestamp, never permanent absence or terminal eligibility. Attempts retain immutable prior outcomes; eligible unfinalised keys recur.';
