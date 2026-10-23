-- READ ONLY: run on staging as the migration role after applying this PR.
-- No tokens, user rows or function bodies are read. The PR revokes CREATE on public.
begin read only;
select current_user as inspected_role, n.nspname as schema_name,
  p.oid::regprocedure as function_name, pg_get_userbyid(p.proowner) as owner,
  p.proconfig,
  pg_has_role(current_user, p.proowner, 'USAGE') as can_act_as_owner,
  n.nspname in ('storage','graphql_public') or exists (
    select 1 from pg_depend d where d.classid='pg_proc'::regclass
      and d.objid=p.oid and d.deptype='e'
  ) as provider_managed
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prosecdef and n.nspname in ('public','private','storage','graphql_public')
order by n.nspname, p.proowner, p.oid::regprocedure::text;

select role_name, schema_name,
  case when n.oid is null then null
    when role_name='PUBLIC' then exists (
      select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      where a.grantee=0 and a.privilege_type='CREATE'
    ) else has_schema_privilege(to_regrole(role_name),n.oid,'CREATE')
  end as has_create -- All existing schema/role combinations must be false.
from (values ('anon'),('authenticated'),('PUBLIC')) roles(role_name)
cross join (values ('public'),('extensions'),('audit')) schemas(schema_name)
left join pg_namespace n on n.nspname=schemas.schema_name
order by schema_name, role_name;
rollback;
