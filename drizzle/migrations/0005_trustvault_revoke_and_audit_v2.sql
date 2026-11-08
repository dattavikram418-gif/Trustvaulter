-- Targeted phase-one correction; legacy rows and canonical bytes remain unchanged.
ALTER TABLE public.audit_events ADD COLUMN canonical_version integer NOT NULL DEFAULT 1,
 ADD COLUMN session_id uuid, ADD COLUMN request_id uuid,
 ADD COLUMN changes jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE FUNCTION public.tv_append_audit_v2(a uuid,d uuid,act text,result text,why text,s uuid,r uuid,c jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE prev text; stamp timestamptz:=clock_timestamp(); body text;
BEGIN
 IF r IS NULL OR c IS NULL OR jsonb_typeof(c)<>'object' THEN RAISE EXCEPTION 'Invalid audit metadata'; END IF;
 PERFORM pg_advisory_xact_lock(81437291);
 SELECT event_hash INTO prev FROM public.audit_events ORDER BY sequence DESC LIMIT 1;
 prev:=coalesce(prev,repeat('0',64));
 body:=jsonb_build_object('version',2,'at',stamp,'actor_id',a,'document_id',d,'action',act,'outcome',result,'reason',why,'session_id',s,'request_id',r,'changes',c)::text;
 INSERT INTO public.audit_events(at,actor_id,document_id,action,outcome,reason,previous_hash,event_hash,canonical,canonical_version,session_id,request_id,changes)
 VALUES(stamp,a,d,act,result,why,prev,encode(sha256(convert_to(prev||body,'UTF8')),'hex'),body,2,s,r,c);
END $$;
REVOKE ALL ON FUNCTION public.tv_append_audit_v2(uuid,uuid,text,text,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Compatibility helper is internal only, and can no longer append v1 events.
CREATE OR REPLACE FUNCTION public.tv_append_audit(a uuid,d uuid,act text,result text,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.tv_append_audit_v2(a,d,act,result,why,NULL,gen_random_uuid(),'{}'::jsonb); END $$;
CREATE FUNCTION public.tv_session_failure_correlated() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid:=gen_random_uuid();
BEGIN PERFORM public.tv_append_audit_v2(NULL,NULL,'session','denied','unverified_identity',NULL,r,'{}'::jsonb); RETURN r; END $$;
REVOKE ALL ON FUNCTION public.tv_session_failure_correlated() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_session_failure_correlated() TO service_role;
CREATE OR REPLACE FUNCTION public.tv_session_failure() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.tv_session_failure_correlated(); END $$;
DO $migration$
DECLARE definition text; original text;
BEGIN
 SELECT pg_get_functiondef('public.tv_operation(text,jsonb)'::regprocedure) INTO original;
 definition:=replace(original,'actor uuid:=auth.uid(); sid uuid;', 'actor uuid:=auth.uid(); sid uuid; audit_sid uuid; request_id uuid:=gen_random_uuid(); changes jsonb:=''{}''::jsonb; old_permission text; prior_revision bigint;');
 definition:=replace(definition,'SELECT * INTO account FROM public.profiles', 'IF reason IS NULL THEN audit_sid:=sid; END IF; SELECT * INTO account FROM public.profiles');
 definition:=regexp_replace(definition,'public\.tv_append_audit\((actor,[^;]+)\);','public.tv_append_audit_v2(\1,audit_sid,request_id,changes);','g');
 definition:=replace(definition,'RETURN jsonb_build_object(''status'',', 'RETURN jsonb_build_object(''request_id'',request_id,''status'',');
 definition:=replace(definition,'e.document_id,e.action,e.outcome FROM public.audit_events e ORDER BY', 'e.document_id,e.action,e.outcome,e.request_id FROM public.audit_events e ORDER BY');
 definition:=replace(definition,'e.document_id,e.action,e.outcome FROM public.audit_events e WHERE', 'e.document_id,e.action,e.outcome,e.canonical_version,e.session_id,e.request_id,e.changes FROM public.audit_events e WHERE');
 definition:=replace(definition,'IF target IS NULL OR target=doc.owner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=target AND active) OR (action=''grant'' AND coalesce(payload->>''permission'','''') NOT IN (''read'',''edit'')) THEN',
 'IF action=''grant'' THEN
       PERFORM 1 FROM public.profiles p JOIN auth.users u ON u.id=p.user_id WHERE p.user_id=target AND p.active AND u.deleted_at IS NULL AND NOT u.is_anonymous AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) FOR SHARE OF p,u;
       IF NOT FOUND THEN reason:=''invalid_target''; END IF;
     END IF;
     IF target IS NULL OR target=doc.owner_id OR reason IS NOT NULL OR (action=''grant'' AND coalesce(payload->>''permission'','''') NOT IN (''read'',''edit'')) THEN');
 definition:=replace(definition,'IF action=''grant'' THEN INSERT INTO public.document_grants',
 'SELECT g.permission INTO old_permission FROM public.document_grants g WHERE g.document_id=docid AND g.user_id=target;
       prior_revision:=doc.acl_revision;
       changes:=jsonb_build_object(''target_user_id'',target,''old_permission'',old_permission,''new_permission'',CASE WHEN action=''grant'' THEN payload->>''permission'' ELSE NULL END,''prior_acl_revision'',prior_revision,''new_acl_revision'',prior_revision+1);
       IF action=''grant'' THEN INSERT INTO public.document_grants');
 IF definition=original OR strpos(definition,'public.tv_append_audit(actor')>0 OR strpos(definition,'prior_acl_revision')=0 OR strpos(definition,'e.canonical_version,e.session_id,e.request_id,e.changes')=0 THEN RAISE EXCEPTION 'Boundary correction did not match expected definition'; END IF;
 EXECUTE definition;
END $migration$;
COMMENT ON COLUMN public.audit_events.canonical_version IS '1: legacy JSON array; 2: structured JSON object including verified session, DB-generated request UUID and changes. Legacy canonical bytes are preserved.';
COMMENT ON COLUMN public.audit_events.session_id IS 'Live actor/session relationship verified at boundary; NULL for unverified or revoked sessions. Never caller payload.';
COMMENT ON COLUMN public.audit_events.request_id IS 'Database-generated per-operation UUID, returned for correlation; NULL only on legacy events.';
