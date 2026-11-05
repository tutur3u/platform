-- RLS policies. Restrictive policies (polpermissive = false), including every
-- account_required_mfa policy, also hash into their own category so a dropped
-- or weakened MFA guard is named on its own.
with pol as (
  select format('%I.%I.%I', n.nspname, c.relname, p.polname) as identity,
    p.polname, p.polpermissive,
    encode(sha256(convert_to(json_build_array(
      p.polcmd, p.polpermissive,
      (select json_agg(case when r = 0 then 'PUBLIC' else pg_get_userbyid(r)::text end
        order by case when r = 0 then 'PUBLIC' else pg_get_userbyid(r)::text end)
        from unnest(p.polroles) r),
      pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)
    )::text, 'UTF8')), 'hex') as digest
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
)
select 'O' as kind, 'policies' as category, identity, digest as value from pol
union all
select 'O', 'restrictive_policies', identity, digest from pol where not polpermissive
union all
select 'M', 'restrictive_policy_count', '', count(*)::text
from pol where not polpermissive
union all
select 'M', 'restrictive_mfa_policy_count', '', count(*)::text
from pol where not polpermissive and polname like 'account\_required\_mfa%';
