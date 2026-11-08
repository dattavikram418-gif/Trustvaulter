DO $migration$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.tv_operation(text,jsonb)'::regprocedure) INTO definition;
EXECUTE replace(definition,'current_role','actor_role');
END $migration$;
