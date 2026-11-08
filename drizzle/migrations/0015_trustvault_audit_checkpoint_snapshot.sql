-- Fixed service-only checkpoint observation; no ledger bytes or history are rewritten.
CREATE TABLE public.audit_checkpoint_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 chain_id uuid NOT NULL DEFAULT gen_random_uuid(),
 system_id uuid NOT NULL DEFAULT gen_random_uuid(),
 counter bigint NOT NULL DEFAULT 0 CHECK(counter>=0)
);
GRANT ALL ON public.audit_checkpoint_state TO service_role;
ALTER TABLE public.audit_checkpoint_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_checkpoint_state FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.audit_checkpoint_state IS 'Private DBA-managed stable chain/deployment identities and observation counter. NOT an independent trust anchor. Pin identities outside DB; restore preserves identities; new deployment deliberately rotates system identity.';
CREATE FUNCTION public.tv_audit_checkpoint_snapshot() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE state public.audit_checkpoint_state%ROWTYPE; head_sequence bigint; head_hash text; request_id uuid:=gen_random_uuid(); observed timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 INSERT INTO public.audit_checkpoint_state(singleton) VALUES(true) ON CONFLICT(singleton) DO NOTHING;
 UPDATE public.audit_checkpoint_state SET counter=counter+1 WHERE singleton RETURNING * INTO state;
 PERFORM public.tv_append_audit_v2(NULL,NULL,'checkpoint_snapshot','allowed','trusted_service_observation',NULL,request_id,jsonb_build_object('chain_id',state.chain_id,'system_id',state.system_id,'counter',state.counter::text));
 SELECT e.sequence,e.event_hash INTO head_sequence,head_hash FROM public.audit_events e ORDER BY e.sequence DESC LIMIT 1;
 observed:=clock_timestamp();
 RETURN jsonb_build_object('version',1,'chain_id',state.chain_id,'system_id',state.system_id,'head_sequence',head_sequence::text,'head_hash',head_hash,'counter',state.counter::text,'observed_at',to_char(observed AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'request_id',request_id);
END $$;
REVOKE ALL ON FUNCTION public.tv_audit_checkpoint_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_audit_checkpoint_snapshot() TO service_role;
COMMENT ON FUNCTION public.tv_audit_checkpoint_snapshot() IS 'No parameters, export or HTTP endpoint. Same ledger mutex; atomically audits observation and returns only exact decimal head/counter/hash and stable DB identities. Required audit failure rolls back observation state. Signing and approved external retention are separate and NOT enabled.';
