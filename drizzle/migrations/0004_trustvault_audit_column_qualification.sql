DO $migration$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.tv_operation(text,jsonb)'::regprocedure) INTO definition;
definition:=replace(definition,'SELECT sequence,at,actor_id,document_id,action,outcome FROM public.audit_events','SELECT e.sequence,e.at,e.actor_id,e.document_id,e.action,e.outcome FROM public.audit_events e');
EXECUTE definition;
END $migration$;
