begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select ok(
  not has_schema_privilege(role_name, 'private', 'USAGE'),
  format('%s cannot use schema private', role_name)
)
from (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name);

-- SR-924: only the policy, CHECK and pre-request dependents keep client-role EXECUTE.
with expected(signature, role_name, privilege_name) as (
values
  ('private.can_join_form_realtime_topic(text,uuid)', 'authenticated', 'EXECUTE'),
  ('private.can_join_task_realtime_topic(text,uuid)', 'authenticated', 'EXECUTE'),
  ('private.valid_subscription_months(date[])', 'authenticated', 'EXECUTE'),
  ('private.get_rate_limit_trust_decision(uuid,inet,uuid)', 'authenticator', 'EXECUTE')
),
actual as (
  select p.oid::regprocedure::text as signature,
         roles.role_name,
         'EXECUTE'::text as privilege_name
  from pg_proc p
  cross join (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name)
  where p.pronamespace = 'private'::regnamespace
    and has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
)
select ok(
  not exists (
    select signature, role_name, privilege_name from actual
    except
    select signature, role_name, privilege_name from expected
  ),
  'private function EXECUTE grants are a subset of the SR-924 keep-list'
);

-- SR-331: unreachable without schema USAGE; shrink this list as privileges are revoked.
with expected(object_name, role_name, privilege_name) as (
values
  ('private.inventory_audit_logs_id_seq', 'anon', 'SELECT'),
  ('private.inventory_audit_logs_id_seq', 'anon', 'UPDATE'),
  ('private.inventory_audit_logs_id_seq', 'anon', 'USAGE'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'SELECT'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'UPDATE'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'USAGE')
),
actual as (
  select c.oid::regclass::text as object_name,
         roles.role_name,
         privileges.privilege_name
  from pg_class c
  cross join (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name)
  cross join (values
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
  ) as privileges(privilege_name)
  where c.relnamespace = 'private'::regnamespace
    and c.relkind in ('r', 'v', 'm', 'p')
    and has_table_privilege(roles.role_name, c.oid, privileges.privilege_name)
  union all
  select c.oid::regclass::text as object_name,
         roles.role_name,
         privileges.privilege_name
  from pg_class c
  cross join (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name)
  cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as privileges(privilege_name)
  where c.relnamespace = 'private'::regnamespace
    and c.relkind = 'S'
    and has_sequence_privilege(roles.role_name, c.oid, privileges.privilege_name)
)
select ok(
  not exists (
    select object_name, role_name, privilege_name from actual
    except
    select object_name, role_name, privilege_name from expected
  ),
  'private table, view, and sequence grants are a subset of the SR-331 snapshot'
);

select is(
  (
    select string_agg(
      format('grantor=%s object_type=%s grantee=%s privilege=%s',
        pg_get_userbyid(d.defaclrole), d.defaclobjtype,
        coalesce(pg_get_userbyid(grant_entry.grantee), 'PUBLIC'),
        grant_entry.privilege_type),
      '; ' order by d.defaclrole, d.defaclobjtype, grant_entry.grantee, grant_entry.privilege_type
    )
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) as grant_entry
    where d.defaclnamespace = 'private'::regnamespace
      and (
        grant_entry.grantee = 0
        or (grant_entry.grantee <> 0 and pg_has_role(role_name, grant_entry.grantee, 'USAGE'))
      )
  ),
  null::text,
  format(
    '%s receives no default privileges in private from any grantor or object type',
    role_name
  )
)
from (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name);

create function private.sr331_default_execute_probe()
returns integer
language sql
as $$ select 1 $$;

select ok(
  not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) grant_entry
    where p.oid = 'private.sr331_default_execute_probe()'::regprocedure
      and grant_entry.grantee = 0
      and grant_entry.privilege_type = 'EXECUTE'
  ),
  'new private functions do not grant EXECUTE to PUBLIC'
);

drop function private.sr331_default_execute_probe();

select ok(
  has_schema_privilege('service_role', 'private', 'USAGE'),
  'service_role retains private schema usage'
);

-- SR-924: service_role reached these functions through the PUBLIC grant before the revoke; it must keep it.
select is(
  (
    select count(*)::int
    from (values
      ('private.abuse_trust_multiplier_for_tier(abuse_risk_tier)'),
  ('private.allocate_inventory_checkout_revenue_trigger()'),
  ('private.build_rate_limit_dblink_connstr()'),
  ('private.clamp_abuse_score(integer)'),
  ('private.cleanup_rate_limits(interval)'),
  ('private.compute_abuse_risk_tier(integer,integer)'),
  ('private.disable_capacity_rule_for_removed_selector()'),
  ('private.enforce_ai_report_review()'),
  ('private.enforce_mail_domain_catch_all_target()'),
  ('private.enforce_mailbox_domain()'),
  ('private.enforce_task_capacity()'),
  ('private.enforce_task_description_chunk_storage_limit()'),
  ('private.enforce_task_relation_capacity()'),
  ('private.ensure_course_module_quiz_submission_grade_state()'),
  ('private.ensure_inventory_bundle_category_scope()'),
  ('private.ensure_inventory_finance_mapping_scope()'),
  ('private.ensure_inventory_product_revenue_share_scope()'),
  ('private.ensure_workspace_quiz_type_grade_state()'),
  ('private.external_chat_fence_binding_update()'),
  ('private.external_chat_set_updated_at()'),
  ('private.get_request_ip(jsonb)'),
  ('private.initialize_inventory_checkout_line_revenue()'),
  ('private.inventory_bundle_category_components_json(uuid,uuid,uuid,text,timestamp with time zone,boolean)'),
  ('private.inventory_bundle_fixed_components_json(uuid,uuid)'),
  ('private.inventory_currency_minor_factor(text)'),
  ('private.inventory_major_to_minor(numeric,text)'),
  ('private.inventory_stock_available_quantity(uuid,uuid,uuid,timestamp with time zone)'),
  ('private.lock_task_capacity_board()'),
  ('private.meet_stream_set_updated_at()'),
  ('private.normalize_inventory_finance_entry()'),
  ('private.parley_scenario_revision()'),
  ('private.populate_inventory_listing_product_image()'),
  ('private.populate_inventory_listing_variant_image()'),
  ('private.prevent_active_catch_all_mailbox_disable()'),
  ('private.raise_rate_limit_exceeded(integer)'),
  ('private.record_rate_limit_attempt(text,text,text,uuid,inet)'),
  ('private.reject_merged_inventory_identity()'),
  ('private.reject_merged_inventory_reference()'),
  ('private.safe_parse_inet(text)'),
  ('private.set_mail_updated_at()'),
  ('private.sync_inventory_checkout_finance_link()'),
  ('private.sync_inventory_product_image_to_listings()'),
  ('private.sync_invoice_legacy_coverage_end()'),
  ('private.task_capacity_rule_usage(uuid)'),
  ('private.task_matches_capacity_rule(uuid,uuid)'),
  ('private.task_matches_capacity_rule_state(uuid,uuid,uuid,uuid,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone)'),
  ('private.try_consume_rate_limit_bucket(text,interval,integer)'),
  ('private.valid_subscription_months(date[])')
    ) as t(signature)
    where to_regprocedure(t.signature) is null
       or not has_function_privilege('service_role', to_regprocedure(t.signature), 'EXECUTE')
  ),
  0,
  'service_role retains EXECUTE on the 48 formerly PUBLIC private functions'
);

-- SR-924: every client-reachable keep-list function pins its search_path.
select is(
  (
    select count(*)::int
    from pg_proc p
    where p.oid = any (array[
      'private.can_join_form_realtime_topic(text,uuid)'::regprocedure,
      'private.can_join_task_realtime_topic(text,uuid)'::regprocedure,
      'private.valid_subscription_months(date[])'::regprocedure,
      'private.get_rate_limit_trust_decision(uuid,inet,uuid)'::regprocedure
    ])
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'
      )
  ),
  0,
  'keep-list functions pin search_path'
);

select * from finish();
rollback;
