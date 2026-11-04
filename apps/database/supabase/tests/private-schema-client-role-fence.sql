begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select ok(
  not has_schema_privilege(role_name, 'private', 'USAGE'),
  format('%s cannot use schema private', role_name)
)
from (values ('anon'), ('authenticated'), ('authenticator')) as roles(role_name);

-- SR-331: unreachable without schema USAGE; shrink this list as privileges are revoked.
with expected(signature, role_name, privilege_name) as (
values
  ('private.abuse_trust_multiplier_for_tier(abuse_risk_tier)', 'anon', 'EXECUTE'),
  ('private.abuse_trust_multiplier_for_tier(abuse_risk_tier)', 'authenticated', 'EXECUTE'),
  ('private.abuse_trust_multiplier_for_tier(abuse_risk_tier)', 'authenticator', 'EXECUTE'),
  ('private.allocate_inventory_checkout_revenue_trigger()', 'anon', 'EXECUTE'),
  ('private.allocate_inventory_checkout_revenue_trigger()', 'authenticated', 'EXECUTE'),
  ('private.allocate_inventory_checkout_revenue_trigger()', 'authenticator', 'EXECUTE'),
  ('private.build_rate_limit_dblink_connstr()', 'anon', 'EXECUTE'),
  ('private.build_rate_limit_dblink_connstr()', 'authenticated', 'EXECUTE'),
  ('private.build_rate_limit_dblink_connstr()', 'authenticator', 'EXECUTE'),
  ('private.can_join_form_realtime_topic(text,uuid)', 'authenticated', 'EXECUTE'),
  ('private.can_join_task_realtime_topic(text,uuid)', 'authenticated', 'EXECUTE'),
  ('private.clamp_abuse_score(integer)', 'anon', 'EXECUTE'),
  ('private.clamp_abuse_score(integer)', 'authenticated', 'EXECUTE'),
  ('private.clamp_abuse_score(integer)', 'authenticator', 'EXECUTE'),
  ('private.cleanup_rate_limits(interval)', 'anon', 'EXECUTE'),
  ('private.cleanup_rate_limits(interval)', 'authenticated', 'EXECUTE'),
  ('private.cleanup_rate_limits(interval)', 'authenticator', 'EXECUTE'),
  ('private.compute_abuse_risk_tier(integer,integer)', 'anon', 'EXECUTE'),
  ('private.compute_abuse_risk_tier(integer,integer)', 'authenticated', 'EXECUTE'),
  ('private.compute_abuse_risk_tier(integer,integer)', 'authenticator', 'EXECUTE'),
  ('private.disable_capacity_rule_for_removed_selector()', 'anon', 'EXECUTE'),
  ('private.disable_capacity_rule_for_removed_selector()', 'authenticated', 'EXECUTE'),
  ('private.disable_capacity_rule_for_removed_selector()', 'authenticator', 'EXECUTE'),
  ('private.enforce_ai_report_review()', 'anon', 'EXECUTE'),
  ('private.enforce_ai_report_review()', 'authenticated', 'EXECUTE'),
  ('private.enforce_ai_report_review()', 'authenticator', 'EXECUTE'),
  ('private.enforce_mail_domain_catch_all_target()', 'anon', 'EXECUTE'),
  ('private.enforce_mail_domain_catch_all_target()', 'authenticated', 'EXECUTE'),
  ('private.enforce_mail_domain_catch_all_target()', 'authenticator', 'EXECUTE'),
  ('private.enforce_mailbox_domain()', 'anon', 'EXECUTE'),
  ('private.enforce_mailbox_domain()', 'authenticated', 'EXECUTE'),
  ('private.enforce_mailbox_domain()', 'authenticator', 'EXECUTE'),
  ('private.enforce_task_capacity()', 'anon', 'EXECUTE'),
  ('private.enforce_task_capacity()', 'authenticated', 'EXECUTE'),
  ('private.enforce_task_capacity()', 'authenticator', 'EXECUTE'),
  ('private.enforce_task_description_chunk_storage_limit()', 'anon', 'EXECUTE'),
  ('private.enforce_task_description_chunk_storage_limit()', 'authenticated', 'EXECUTE'),
  ('private.enforce_task_description_chunk_storage_limit()', 'authenticator', 'EXECUTE'),
  ('private.enforce_task_relation_capacity()', 'anon', 'EXECUTE'),
  ('private.enforce_task_relation_capacity()', 'authenticated', 'EXECUTE'),
  ('private.enforce_task_relation_capacity()', 'authenticator', 'EXECUTE'),
  ('private.ensure_course_module_quiz_submission_grade_state()', 'anon', 'EXECUTE'),
  ('private.ensure_course_module_quiz_submission_grade_state()', 'authenticated', 'EXECUTE'),
  ('private.ensure_course_module_quiz_submission_grade_state()', 'authenticator', 'EXECUTE'),
  ('private.ensure_inventory_bundle_category_scope()', 'anon', 'EXECUTE'),
  ('private.ensure_inventory_bundle_category_scope()', 'authenticated', 'EXECUTE'),
  ('private.ensure_inventory_bundle_category_scope()', 'authenticator', 'EXECUTE'),
  ('private.ensure_inventory_finance_mapping_scope()', 'anon', 'EXECUTE'),
  ('private.ensure_inventory_finance_mapping_scope()', 'authenticated', 'EXECUTE'),
  ('private.ensure_inventory_finance_mapping_scope()', 'authenticator', 'EXECUTE'),
  ('private.ensure_inventory_product_revenue_share_scope()', 'anon', 'EXECUTE'),
  ('private.ensure_inventory_product_revenue_share_scope()', 'authenticated', 'EXECUTE'),
  ('private.ensure_inventory_product_revenue_share_scope()', 'authenticator', 'EXECUTE'),
  ('private.ensure_workspace_quiz_type_grade_state()', 'anon', 'EXECUTE'),
  ('private.ensure_workspace_quiz_type_grade_state()', 'authenticated', 'EXECUTE'),
  ('private.ensure_workspace_quiz_type_grade_state()', 'authenticator', 'EXECUTE'),
  ('private.external_chat_fence_binding_update()', 'anon', 'EXECUTE'),
  ('private.external_chat_fence_binding_update()', 'authenticated', 'EXECUTE'),
  ('private.external_chat_fence_binding_update()', 'authenticator', 'EXECUTE'),
  ('private.external_chat_set_updated_at()', 'anon', 'EXECUTE'),
  ('private.external_chat_set_updated_at()', 'authenticated', 'EXECUTE'),
  ('private.external_chat_set_updated_at()', 'authenticator', 'EXECUTE'),
  ('private.get_rate_limit_trust_decision(uuid,inet,uuid)', 'authenticator', 'EXECUTE'),
  ('private.get_request_ip(jsonb)', 'anon', 'EXECUTE'),
  ('private.get_request_ip(jsonb)', 'authenticated', 'EXECUTE'),
  ('private.get_request_ip(jsonb)', 'authenticator', 'EXECUTE'),
  ('private.initialize_inventory_checkout_line_revenue()', 'anon', 'EXECUTE'),
  ('private.initialize_inventory_checkout_line_revenue()', 'authenticated', 'EXECUTE'),
  ('private.initialize_inventory_checkout_line_revenue()', 'authenticator', 'EXECUTE'),
  ('private.inventory_bundle_category_components_json(uuid,uuid,uuid,text,timestamp with time zone,boolean)', 'anon', 'EXECUTE'),
  ('private.inventory_bundle_category_components_json(uuid,uuid,uuid,text,timestamp with time zone,boolean)', 'authenticated', 'EXECUTE'),
  ('private.inventory_bundle_category_components_json(uuid,uuid,uuid,text,timestamp with time zone,boolean)', 'authenticator', 'EXECUTE'),
  ('private.inventory_bundle_fixed_components_json(uuid,uuid)', 'anon', 'EXECUTE'),
  ('private.inventory_bundle_fixed_components_json(uuid,uuid)', 'authenticated', 'EXECUTE'),
  ('private.inventory_bundle_fixed_components_json(uuid,uuid)', 'authenticator', 'EXECUTE'),
  ('private.inventory_currency_minor_factor(text)', 'anon', 'EXECUTE'),
  ('private.inventory_currency_minor_factor(text)', 'authenticated', 'EXECUTE'),
  ('private.inventory_currency_minor_factor(text)', 'authenticator', 'EXECUTE'),
  ('private.inventory_major_to_minor(numeric,text)', 'anon', 'EXECUTE'),
  ('private.inventory_major_to_minor(numeric,text)', 'authenticated', 'EXECUTE'),
  ('private.inventory_major_to_minor(numeric,text)', 'authenticator', 'EXECUTE'),
  ('private.inventory_stock_available_quantity(uuid,uuid,uuid,timestamp with time zone)', 'anon', 'EXECUTE'),
  ('private.inventory_stock_available_quantity(uuid,uuid,uuid,timestamp with time zone)', 'authenticated', 'EXECUTE'),
  ('private.inventory_stock_available_quantity(uuid,uuid,uuid,timestamp with time zone)', 'authenticator', 'EXECUTE'),
  ('private.lock_task_capacity_board()', 'anon', 'EXECUTE'),
  ('private.lock_task_capacity_board()', 'authenticated', 'EXECUTE'),
  ('private.lock_task_capacity_board()', 'authenticator', 'EXECUTE'),
  ('private.meet_stream_set_updated_at()', 'anon', 'EXECUTE'),
  ('private.meet_stream_set_updated_at()', 'authenticated', 'EXECUTE'),
  ('private.meet_stream_set_updated_at()', 'authenticator', 'EXECUTE'),
  ('private.normalize_inventory_finance_entry()', 'anon', 'EXECUTE'),
  ('private.normalize_inventory_finance_entry()', 'authenticated', 'EXECUTE'),
  ('private.normalize_inventory_finance_entry()', 'authenticator', 'EXECUTE'),
  ('private.parley_scenario_revision()', 'anon', 'EXECUTE'),
  ('private.parley_scenario_revision()', 'authenticated', 'EXECUTE'),
  ('private.parley_scenario_revision()', 'authenticator', 'EXECUTE'),
  ('private.populate_inventory_listing_product_image()', 'anon', 'EXECUTE'),
  ('private.populate_inventory_listing_product_image()', 'authenticated', 'EXECUTE'),
  ('private.populate_inventory_listing_product_image()', 'authenticator', 'EXECUTE'),
  ('private.populate_inventory_listing_variant_image()', 'anon', 'EXECUTE'),
  ('private.populate_inventory_listing_variant_image()', 'authenticated', 'EXECUTE'),
  ('private.populate_inventory_listing_variant_image()', 'authenticator', 'EXECUTE'),
  ('private.prevent_active_catch_all_mailbox_disable()', 'anon', 'EXECUTE'),
  ('private.prevent_active_catch_all_mailbox_disable()', 'authenticated', 'EXECUTE'),
  ('private.prevent_active_catch_all_mailbox_disable()', 'authenticator', 'EXECUTE'),
  ('private.raise_rate_limit_exceeded(integer)', 'anon', 'EXECUTE'),
  ('private.raise_rate_limit_exceeded(integer)', 'authenticated', 'EXECUTE'),
  ('private.raise_rate_limit_exceeded(integer)', 'authenticator', 'EXECUTE'),
  ('private.record_rate_limit_attempt(text,text,text,uuid,inet)', 'anon', 'EXECUTE'),
  ('private.record_rate_limit_attempt(text,text,text,uuid,inet)', 'authenticated', 'EXECUTE'),
  ('private.record_rate_limit_attempt(text,text,text,uuid,inet)', 'authenticator', 'EXECUTE'),
  ('private.reject_merged_inventory_identity()', 'anon', 'EXECUTE'),
  ('private.reject_merged_inventory_identity()', 'authenticated', 'EXECUTE'),
  ('private.reject_merged_inventory_identity()', 'authenticator', 'EXECUTE'),
  ('private.reject_merged_inventory_reference()', 'anon', 'EXECUTE'),
  ('private.reject_merged_inventory_reference()', 'authenticated', 'EXECUTE'),
  ('private.reject_merged_inventory_reference()', 'authenticator', 'EXECUTE'),
  ('private.safe_parse_inet(text)', 'anon', 'EXECUTE'),
  ('private.safe_parse_inet(text)', 'authenticated', 'EXECUTE'),
  ('private.safe_parse_inet(text)', 'authenticator', 'EXECUTE'),
  ('private.set_mail_updated_at()', 'anon', 'EXECUTE'),
  ('private.set_mail_updated_at()', 'authenticated', 'EXECUTE'),
  ('private.set_mail_updated_at()', 'authenticator', 'EXECUTE'),
  ('private.sync_inventory_checkout_finance_link()', 'anon', 'EXECUTE'),
  ('private.sync_inventory_checkout_finance_link()', 'authenticated', 'EXECUTE'),
  ('private.sync_inventory_checkout_finance_link()', 'authenticator', 'EXECUTE'),
  ('private.sync_inventory_product_image_to_listings()', 'anon', 'EXECUTE'),
  ('private.sync_inventory_product_image_to_listings()', 'authenticated', 'EXECUTE'),
  ('private.sync_inventory_product_image_to_listings()', 'authenticator', 'EXECUTE'),
  ('private.sync_invoice_legacy_coverage_end()', 'anon', 'EXECUTE'),
  ('private.sync_invoice_legacy_coverage_end()', 'authenticated', 'EXECUTE'),
  ('private.sync_invoice_legacy_coverage_end()', 'authenticator', 'EXECUTE'),
  ('private.task_capacity_rule_usage(uuid)', 'anon', 'EXECUTE'),
  ('private.task_capacity_rule_usage(uuid)', 'authenticated', 'EXECUTE'),
  ('private.task_capacity_rule_usage(uuid)', 'authenticator', 'EXECUTE'),
  ('private.task_matches_capacity_rule_state(uuid,uuid,uuid,uuid,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone)', 'anon', 'EXECUTE'),
  ('private.task_matches_capacity_rule_state(uuid,uuid,uuid,uuid,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone)', 'authenticated', 'EXECUTE'),
  ('private.task_matches_capacity_rule_state(uuid,uuid,uuid,uuid,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone)', 'authenticator', 'EXECUTE'),
  ('private.task_matches_capacity_rule(uuid,uuid)', 'anon', 'EXECUTE'),
  ('private.task_matches_capacity_rule(uuid,uuid)', 'authenticated', 'EXECUTE'),
  ('private.task_matches_capacity_rule(uuid,uuid)', 'authenticator', 'EXECUTE'),
  ('private.try_consume_rate_limit_bucket(text,interval,integer)', 'anon', 'EXECUTE'),
  ('private.try_consume_rate_limit_bucket(text,interval,integer)', 'authenticated', 'EXECUTE'),
  ('private.try_consume_rate_limit_bucket(text,interval,integer)', 'authenticator', 'EXECUTE'),
  ('private.valid_subscription_months(date[])', 'anon', 'EXECUTE'),
  ('private.valid_subscription_months(date[])', 'authenticated', 'EXECUTE'),
  ('private.valid_subscription_months(date[])', 'authenticator', 'EXECUTE')
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
  'private function EXECUTE grants are a subset of the SR-331 snapshot'
);

-- SR-331: unreachable without schema USAGE; shrink this list as privileges are revoked.
with expected(object_name, role_name, privilege_name) as (
values
  ('private.inventory_audit_logs_id_seq', 'anon', 'SELECT'),
  ('private.inventory_audit_logs_id_seq', 'anon', 'UPDATE'),
  ('private.inventory_audit_logs_id_seq', 'anon', 'USAGE'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'SELECT'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'UPDATE'),
  ('private.inventory_audit_logs_id_seq', 'authenticated', 'USAGE'),
  ('private.note_voice_jobs', 'authenticated', 'SELECT')
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

select * from finish();
rollback;
