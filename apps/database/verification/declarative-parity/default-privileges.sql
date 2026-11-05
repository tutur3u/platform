-- ALTER DEFAULT PRIVILEGES state (pg_default_acl), global or per schema.
select 'O' as kind, 'default_privileges' as category,
  format('%s:%s:%s', pg_get_userbyid(d.defaclrole),
    coalesce(quote_ident(n.nspname), '*'), d.defaclobjtype) as identity,
  encode(sha256(convert_to(json_build_array(
    (select coalesce(json_agg(a::text order by a::text), '[]') from unnest(d.defaclacl) a)
  )::text, 'UTF8')), 'hex') as value
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace;
