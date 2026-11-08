-- A01/A02/A03 correction for the 0017 admin investigation boundary. 0017 is not rewritten; functions are replaced.
-- A01: sequential validation; malformed history => NULL (unavailable), never coercion/rounding/exception.
CREATE OR REPLACE FUNCTION public.tv_admin_change(e public.audit_events) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; ks text[]; p text; nw text;
BEGIN
 IF e.canonical_version IS DISTINCT FROM 2 OR e.action IS NULL OR e.action NOT IN ('grant','revoke') OR e.outcome IS DISTINCT FROM 'allowed' THEN RETURN NULL; END IF;
 c:=e.changes;
 IF c IS NULL OR jsonb_typeof(c)<>'object' THEN RETURN NULL; END IF;
 SELECT array_agg(k ORDER BY k) INTO ks FROM jsonb_object_keys(c) k;
 IF ks IS DISTINCT FROM ARRAY['new_acl_revision','new_permission','old_permission','prior_acl_revision','target_user_id'] THEN RETURN NULL; END IF;
 IF jsonb_typeof(c->'target_user_id')<>'string' THEN RETURN NULL; END IF;
 IF NOT ((c->>'target_user_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN NULL; END IF;
 IF NOT (jsonb_typeof(c->'old_permission')='null' OR (jsonb_typeof(c->'old_permission')='string' AND (c->>'old_permission') IN ('read','edit'))) THEN RETURN NULL; END IF;
 IF e.action='grant' THEN
   IF jsonb_typeof(c->'new_permission')<>'string' THEN RETURN NULL; END IF;
   IF (c->>'new_permission') NOT IN ('read','edit') THEN RETURN NULL; END IF;
 ELSIF jsonb_typeof(c->'new_permission')<>'null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(c->'prior_acl_revision')<>'number' OR jsonb_typeof(c->'new_acl_revision')<>'number' THEN RETURN NULL; END IF;
 p:=c->>'prior_acl_revision'; nw:=c->>'new_acl_revision';
 -- Canonical nonnegative integer text only (rejects fraction, sign, exponent, leading zero, >19 digits).
 IF p !~ '^(0|[1-9][0-9]{0,18})$' OR nw !~ '^(0|[1-9][0-9]{0,18})$' THEN RETURN NULL; END IF;
 IF p::numeric>9223372036854775806 OR nw::numeric<>p::numeric+1 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('recipient_id',c->>'target_user_id','old_permission',c->'old_permission','new_permission',c->'new_permission',
   'prior_acl_revision',p,'new_acl_revision',nw);
END $$;
REVOKE ALL ON FUNCTION public.tv_admin_change(public.audit_events) FROM PUBLIC,anon,authenticated,service_role;

-- A02/A03 + verified identity. Bigints are exact decimal strings in and out.
CREATE OR REPLACE FUNCTION public.tv_admin_events(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 claims jsonb; actor uuid; sid uuid; verified boolean:=false; actor_role public.tv_role; status integer:=200; why text;
 req uuid:=gen_random_uuid(); grp text; act text; outc text; f_actor uuid; f_doc uuid; f_recipient uuid;
 lower_date timestamptz; upper_date timestamptz; before_seq bigint; lim integer; out_rows jsonb; n integer; next_before bigint;
 uuid_re constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 date_re constant text:='^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}:?[0-9]{2})?)?$';
 k text; v jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 -- Guarded claim parsing: no cast is attempted before shape checks, so malformed claims cannot raise unaudited.
 claims:=auth.jwt();
 IF claims IS NOT NULL AND jsonb_typeof(claims)='object'
   AND jsonb_typeof(claims->'sub')='string' AND lower(claims->>'sub') ~ uuid_re
   AND jsonb_typeof(claims->'session_id')='string' AND lower(claims->>'session_id') ~ uuid_re
   AND jsonb_typeof(claims->'exp')='number' AND (claims->>'exp') ~ '^[1-9][0-9]{0,11}$'
   AND (claims->>'exp')::numeric>extract(epoch FROM clock_timestamp()) THEN
   actor:=(claims->>'sub')::uuid; sid:=(claims->>'session_id')::uuid;
   verified:=public.tv_bridge_identity(actor,sid);
 END IF;
 IF NOT verified THEN
   -- Unverified/mismatched/revoked/disabled identity: never attribute candidate actor/session.
   PERFORM public.tv_append_audit_v2(NULL,NULL,'admin_events','denied','invalid_session',NULL,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',401,'error','Authentication required');
 END IF;
 SELECT role INTO actor_role FROM public.user_roles WHERE user_id=actor FOR SHARE;
 IF actor_role IS DISTINCT FROM 'administrator' THEN
   PERFORM public.tv_append_audit_v2(actor,NULL,'admin_events','denied','administrator_required',sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',404,'error','Not found');
 END IF;
 IF payload IS NULL OR octet_length(payload::text)>16384 THEN status:=413; why:='request_too_large';
 ELSIF jsonb_typeof(payload)<>'object' THEN status:=400; why:='invalid_parameters';
 ELSE
   FOR k,v IN SELECT * FROM jsonb_each(payload) LOOP
     IF why IS NOT NULL THEN EXIT; END IF;
     IF k='limit' THEN
       IF jsonb_typeof(v)<>'number' OR (v#>>'{}') !~ '^[1-9][0-9]{0,2}$' THEN why:='invalid_parameters'; END IF;
     ELSIF k IN ('group','action','outcome','actor_id','document_id','recipient_id','from','to','before') THEN
       IF jsonb_typeof(v)<>'string' OR length(v#>>'{}')>40 THEN why:='invalid_parameters'; END IF;
     ELSE why:='invalid_parameters'; END IF;
   END LOOP;
   IF why IS NULL THEN
     grp:=coalesce(payload->>'group','all'); act:=payload->>'action'; outc:=payload->>'outcome';
     IF grp NOT IN ('all','permission_changes') OR (act IS NOT NULL AND act !~ '^[a-z_]{1,40}$') OR (outc IS NOT NULL AND outc NOT IN ('allowed','denied'))
       OR (payload->>'actor_id') !~ uuid_re OR (payload->>'document_id') !~ uuid_re OR (payload->>'recipient_id') !~ uuid_re
       OR (payload->>'from') !~ date_re OR (payload->>'to') !~ date_re
       OR (payload->>'before') !~ '^[1-9][0-9]{0,18}$' THEN why:='invalid_parameters';
     ELSIF (payload->>'before')::numeric>9223372036854775807 OR coalesce((payload->>'limit')::integer,50)>100 THEN why:='invalid_parameters';
     END IF;
   END IF;
   IF why IS NULL THEN
     BEGIN
       f_actor:=(payload->>'actor_id')::uuid; f_doc:=(payload->>'document_id')::uuid; f_recipient:=(payload->>'recipient_id')::uuid;
       lower_date:=(payload->>'from')::timestamptz; upper_date:=(payload->>'to')::timestamptz;
       before_seq:=(payload->>'before')::bigint; lim:=coalesce((payload->>'limit')::integer,50);
       IF lower_date>upper_date THEN why:='invalid_parameters'; END IF;
     EXCEPTION WHEN OTHERS THEN why:='invalid_parameters';
     END;
   END IF;
   IF why IS NOT NULL THEN status:=400; END IF;
 END IF;
 IF why IS NOT NULL THEN
   PERFORM public.tv_append_audit_v2(actor,NULL,'admin_events','denied',why,sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',status,'error',CASE WHEN status=413 THEN 'Request too large' ELSE 'Invalid request' END);
 END IF;
 WITH matched AS (
   SELECT e.sequence,e.at,e.actor_id,e.document_id,e.action,e.outcome,e.request_id,public.tv_admin_change(e) c
   FROM public.audit_events e
   WHERE (before_seq IS NULL OR e.sequence<before_seq)
     AND (grp='all' OR e.action IN ('grant','revoke'))
     AND (act IS NULL OR e.action=act) AND (outc IS NULL OR e.outcome=outc)
     AND (f_actor IS NULL OR e.actor_id=f_actor) AND (f_doc IS NULL OR e.document_id=f_doc)
     AND (lower_date IS NULL OR e.at>=lower_date) AND (upper_date IS NULL OR e.at<=upper_date)
     AND (f_recipient IS NULL OR public.tv_admin_change(e)->>'recipient_id'=f_recipient::text)
   ORDER BY e.sequence DESC LIMIT lim+1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'sequence',sequence::text,'at',at,'actor_id',actor_id,'document_id',document_id,'action',action,'outcome',outcome,'request_id',request_id,
   'permission_detail',CASE WHEN action NOT IN ('grant','revoke') THEN 'not_applicable' WHEN c IS NULL THEN 'unavailable' ELSE 'recorded' END,
   'recipient_id',c->'recipient_id','old_permission',c->'old_permission','new_permission',c->'new_permission',
   'prior_acl_revision',c->'prior_acl_revision','new_acl_revision',c->'new_acl_revision') ORDER BY sequence DESC) FILTER (WHERE rn<=lim),'[]'::jsonb),
   count(*)::integer, min(sequence) FILTER (WHERE rn<=lim)
 INTO out_rows,n,next_before FROM (SELECT *,row_number() OVER (ORDER BY sequence DESC) rn FROM matched) t;
 IF n<=lim THEN next_before:=NULL; END IF;
 PERFORM public.tv_append_audit_v2(actor,NULL,'admin_events','allowed','administrator_observation',sid,req,
   jsonb_build_object('returned',least(n,lim),'group',grp,'filtered',(SELECT count(*) FROM jsonb_object_keys(payload) x WHERE x NOT IN ('group','limit','before'))>0));
 RETURN jsonb_build_object('request_id',req,'status',200,'data',jsonb_build_object('events',out_rows,'next_before',next_before::text));
END $$;
REVOKE ALL ON FUNCTION public.tv_admin_events(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.tv_admin_events(jsonb) IS '0018: verified live identity (NULL attribution when unverified), 16384-byte payload bound, typed bounded fields, exact decimal-string sequence/cursor/revisions. Administrator-only security metadata; no ordinary document access.';

-- Malformed (non-UUID) subject claims previously raised in tv_operation's DECLARE initializer before any audit.
-- Parse auth.uid() inside a guarded block after the admin dispatch so every path reaches an audited denial.
DO $migration$
DECLARE definition text; original text;
BEGIN
 SELECT pg_get_functiondef('public.tv_operation(text,jsonb)'::regprocedure) INTO original;
 definition:=replace(original,'actor uuid:=auth.uid(); sid uuid;','actor uuid; sid uuid;');
 definition:=replace(definition,' IF action=''admin_events'' THEN RETURN public.tv_admin_events(coalesce(payload,''null''::jsonb)); END IF;',
  ' IF action=''admin_events'' THEN RETURN public.tv_admin_events(coalesce(payload,''null''::jsonb)); END IF;
 BEGIN actor:=auth.uid(); EXCEPTION WHEN OTHERS THEN actor:=NULL; END;');
 IF definition=original OR strpos(definition,'actor uuid:=auth.uid()')>0 OR strpos(definition,'EXCEPTION WHEN OTHERS THEN actor:=NULL')=0 THEN RAISE EXCEPTION 'tv_operation guard did not match expected definition'; END IF;
 EXECUTE definition;
END $migration$;
