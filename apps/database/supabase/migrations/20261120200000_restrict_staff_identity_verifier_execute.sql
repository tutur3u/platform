begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Complete owner-run definition of the staff identity verifier with its QA
-- test account exclusions and an explicit ACL. Only definer-owned staff gates
-- call it, so no client or service role may execute it directly.

create or replace function private.staff_identity_verified(p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path = pg_catalog, pg_temp
as $function$
  with tenant as (
    select nullif(pg_catalog.btrim(c.value), '') as id
    from private.security_config c
    where c.key = 'azure_staff_tenant_id'
  )
  select coalesce((
    select u.email_confirmed_at is not null
      and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'qa_test')
      and not private.is_qa_test_address(u.email)
      and exists (select 1 from auth.identities any_identity where any_identity.user_id = u.id)
      and not exists (
        select 1
        from auth.identities i
        cross join lateral (
          select case when pg_catalog.jsonb_typeof(i.identity_data -> 'iss') = 'string'
            then pg_catalog.regexp_match(i.identity_data ->> 'iss',
              '^https://(?:login\.microsoftonline\.com/([^/]+)/v2\.0|sts\.windows\.net/([^/]+)/)$')
          end as m
        ) issuer
        where i.user_id = u.id
          and i.provider = 'azure'
          and not coalesce(
            (select t.id from tenant t) is not null
            and (case
              when coalesce(pg_catalog.jsonb_typeof(i.identity_data -> 'tid'), 'null') = 'null'
                then coalesce(issuer.m[1], issuer.m[2])
              when pg_catalog.jsonb_typeof(i.identity_data -> 'tid') = 'string'
                then i.identity_data ->> 'tid'
            end) = (select t.id from tenant t)
            and (not (i.identity_data ? 'iss')
              or coalesce(issuer.m[1], issuer.m[2]) = (select t.id from tenant t)),
            false
          )
      )
    from auth.users u
    where u.id = p_user_id
  ), false)
$function$;

revoke all on function private.staff_identity_verified(uuid) from public, anon, authenticated, service_role;

commit;
