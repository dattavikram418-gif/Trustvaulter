-- Administrator permission-change investigation (security metadata only).
-- Adds no table privileges and no ordinary document/grant/content access for administrators.
-- Legacy (v1) and denied events are projected as "unavailable"; history is never inferred.
CREATE FUNCTION public.tv_admin_change(e public.audit_events) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN e.canonical_version=2 AND e.action IN ('grant','revoke') AND e.outcome='allowed'
   AND jsonb_typeof(e.changes)='object'
   AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e.changes) k)=ARRAY['new_acl_revision','new_permission','old_permission','prior_acl_revision','target_user_id']
   AND jsonb_typeof(e.changes->'target_user_id')='string'
   AND (e.changes->>'target_user_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND (e.changes->'old_permission'='null'::jsonb OR e.changes->>'old_permission' IN ('read','edit'))
   AND ((e.action='grant' AND e.changes->>'new_permission' IN ('read','edit')) OR (e.action='revoke' AND e.changes->'new_permission'='null'::jsonb))
   AND jsonb_typeof(e.changes->'prior_acl_revision')='number' AND jsonb_typeof(e.changes->'new_acl_revision')='number'
   AND (e.changes->>'new_acl_revision')::numeric=(e.changes->>'prior_acl_revision')::numeric+1
 THEN jsonb_build_object('recipient_id',e.changes->>'target_user_id','old_permission',e.changes->>'old_permission',
   'new_permission',e.changes->>'new_permission','prior_acl_revision',(e.changes->>'prior_acl_revision')::bigint,
   'new_acl_revision',(e.changes->>'new_acl_revision')::bigint)
 ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.tv_admin_change(public.audit_events) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.tv_admin_events(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 actor uuid; sid uuid; audit_sid uuid; reason text; account public.profiles; actor_role public.tv_role;
 req uuid:=gen_random_uuid(); grp text; act text; outc text; f_actor uuid; f_doc uuid; f_recipient uuid;
 lower_date timestamptz; upper_date timestamptz; before_seq bigint; lim integer; out_rows jsonb; n integer; next_before bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(81437291);
 BEGIN actor:=auth.uid(); sid:=(auth.jwt()->>'session_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN actor:=NULL; sid:=NULL; END;
 IF actor IS NULL OR sid IS NULL OR coalesce((auth.jwt()->>'exp')::numeric,0)<=extract(epoch FROM clock_timestamp()) THEN reason:='invalid_session';
 ELSE
   PERFORM 1 FROM auth.sessions WHERE id=sid AND user_id=actor AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
   IF NOT FOUND THEN reason:='revoked_session'; END IF;
   PERFORM 1 FROM auth.users WHERE id=actor AND deleted_at IS NULL AND NOT is_anonymous AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
   IF NOT FOUND THEN reason:='disabled_identity'; END IF;
   IF reason IS NULL THEN audit_sid:=sid; END IF;
   SELECT * INTO account FROM public.profiles WHERE user_id=actor FOR SHARE;
   IF NOT FOUND OR NOT account.active THEN reason:='inactive_account'; END IF;
   SELECT role INTO actor_role FROM public.user_roles WHERE user_id=actor FOR SHARE;
   IF actor_role IS NULL THEN reason:='missing_role'; END IF;
 END IF;
 IF reason IS NOT NULL THEN
   PERFORM public.tv_append_audit_v2(actor,NULL,'admin_events','denied',reason,audit_sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',401,'error','Authentication required');
 END IF;
 IF actor_role<>'administrator' THEN
   PERFORM public.tv_append_audit_v2(actor,NULL,'admin_events','denied','administrator_required',audit_sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',404,'error','Not found');
 END IF;
 BEGIN
   IF jsonb_typeof(payload)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k=ANY(ARRAY['group','action','outcome','actor_id','document_id','recipient_id','from','to','before','limit']))
     OR EXISTS(SELECT 1 FROM jsonb_each(payload) e WHERE jsonb_typeof(e.value) NOT IN ('string','number')) THEN RAISE EXCEPTION 'keys'; END IF;
   grp:=coalesce(payload->>'group','all'); act:=payload->>'action'; outc:=payload->>'outcome';
   f_actor:=(payload->>'actor_id')::uuid; f_doc:=(payload->>'document_id')::uuid; f_recipient:=(payload->>'recipient_id')::uuid;
   lower_date:=(payload->>'from')::timestamptz; upper_date:=(payload->>'to')::timestamptz;
   before_seq:=(payload->>'before')::bigint; lim:=coalesce((payload->>'limit')::integer,50);
   IF grp NOT IN ('all','permission_changes') OR (act IS NOT NULL AND act !~ '^[a-z_]{1,40}$') OR (outc IS NOT NULL AND outc NOT IN ('allowed','denied'))
     OR lim<1 OR lim>100 OR before_seq<1 OR lower_date>upper_date THEN RAISE EXCEPTION 'range'; END IF;
 EXCEPTION WHEN OTHERS THEN
   PERFORM public.tv_append_audit_v2(actor,NULL,'admin_events','denied','invalid_parameters',audit_sid,req,'{}'::jsonb);
   RETURN jsonb_build_object('request_id',req,'status',400,'error','Invalid request');
 END;
 WITH matched AS (
   SELECT e.sequence,e.at,e.actor_id,e.document_id,e.action,e.outcome,e.request_id,e.canonical_version,public.tv_admin_change(e) c
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
   'sequence',sequence,'at',at,'actor_id',actor_id,'document_id',document_id,'action',action,'outcome',outcome,'request_id',request_id,
   'permission_detail',CASE WHEN action NOT IN ('grant','revoke') THEN 'not_applicable' WHEN c IS NULL THEN 'unavailable' ELSE 'recorded' END,
   'recipient_id',c->'recipient_id','old_permission',c->'old_permission','new_permission',c->'new_permission',
   'prior_acl_revision',c->'prior_acl_revision','new_acl_revision',c->'new_acl_revision') ORDER BY sequence DESC) FILTER (WHERE rn<=lim),'[]'::jsonb),
   count(*)::integer, min(sequence) FILTER (WHERE rn<=lim)
 INTO out_rows,n,next_before FROM (SELECT *,row_number() OVER (ORDER BY sequence DESC) rn FROM matched) t;
 IF n<=lim THEN next_before:=NULL; END IF;
 -- Observation audit records only the filter shape and result count, never returned rows.
 PERFORM public.tv_append_audit_v2(actor,NULL,'admin_events','allowed','administrator_observation',audit_sid,req,
   jsonb_build_object('returned',least(n,lim),'group',grp,'filtered',(SELECT count(*) FROM jsonb_object_keys(payload) k WHERE k NOT IN ('group','limit','before'))>0));
 RETURN jsonb_build_object('request_id',req,'status',200,'data',jsonb_build_object('events',out_rows,'next_before',next_before));
END $$;
REVOKE ALL ON FUNCTION public.tv_admin_events(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Route through the existing single RPC/HTTP entry point; dispatch precedes all other logic.
DO $migration$
DECLARE definition text; original text;
BEGIN
 SELECT pg_get_functiondef('public.tv_operation(text,jsonb)'::regprocedure) INTO original;
 definition:=replace(original,' -- A single phase-one transaction mutex serializes ACL decisions, reads, mutations and audit append.',
  ' IF action=''admin_events'' THEN RETURN public.tv_admin_events(coalesce(payload,''null''::jsonb)); END IF;
 -- A single phase-one transaction mutex serializes ACL decisions, reads, mutations and audit append.');
 IF definition=original THEN RAISE EXCEPTION 'Admin dispatch did not match expected definition'; END IF;
 EXECUTE definition;
END $migration$;
COMMENT ON FUNCTION public.tv_admin_events(jsonb) IS 'Administrator-only audited security-metadata projection. Permission values only from validated v2 allowed grant/revoke changes; otherwise unavailable. No titles, sessions, reasons, canonical bytes or raw changes.';
