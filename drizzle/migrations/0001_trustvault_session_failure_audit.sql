CREATE FUNCTION public.tv_session_failure() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN PERFORM public.tv_append_audit(NULL,NULL,'session','denied','unverified_identity'); END $$;
REVOKE ALL ON FUNCTION public.tv_session_failure() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_session_failure() TO service_role;
