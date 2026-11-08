DO $migration$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.tv_operation(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'jsonb_typeof(payload)<>''object''','jsonb_typeof(payload) IS DISTINCT FROM ''object''');
 definition:=replace(definition,'IF allowed_keys IS NULL OR', 'IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM ''object'' THEN PERFORM public.tv_append_audit(actor,NULL,coalesce(action,''invalid''),''denied'',''invalid_parameters''); RETURN jsonb_build_object(''status'',400,''error'',''Invalid request''); END IF; IF allowed_keys IS NULL OR');
 definition:=replace(definition,'docid:=(payload->>''id'')::uuid;', 'IF octet_length(payload::text)>16384 OR EXISTS(SELECT 1 FROM jsonb_each(payload) v WHERE jsonb_typeof(v.value) NOT IN (''string'',''number'')) THEN RAISE EXCEPTION ''type_or_size''; END IF; docid:=(payload->>''id'')::uuid;');
 EXECUTE definition;
 END $migration$;
REVOKE ALL ON public.documents,public.document_grants,public.document_versions FROM service_role;
REVOKE INSERT ON public.audit_events FROM service_role;
REVOKE USAGE,SELECT ON SEQUENCE public.audit_events_sequence_seq FROM service_role;
