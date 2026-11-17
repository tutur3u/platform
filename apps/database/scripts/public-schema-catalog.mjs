/**
 * Authoritative public schema check against a reset database catalog.
 * The static layer is scripts/check-public-schema-objects.js; the allowlist
 * and rollout plan are described in
 * apps/docs/build/devops/public-schema-privatization.mdx.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const allowlistModule = require('../../../scripts/public-schema-guard/allowlist.js');

export const { ALLOWLIST_PATH, parseAllowlist, expiredCompatViews } =
  allowlistModule;

const CLIENT_ROLES = new Set(['anon', 'authenticated', 'PUBLIC']);

/**
 * One read-only statement returning a single JSON document. Extension-owned
 * relations are excluded; they are not application tables.
 */
export const CATALOG_SQL = `begin read only;
set local statement_timeout = '60s';
select json_build_object(
  'relations', coalesce((
    select json_agg(json_build_object(
      'name', c.relname,
      'relkind', c.relkind,
      'rls', c.relrowsecurity,
      'grantees', coalesce((
        select json_agg(distinct case a.grantee when 0 then 'PUBLIC'
          else pg_catalog.pg_get_userbyid(a.grantee) end)
        from pg_catalog.aclexplode(c.relacl) a
      ), '[]'::json),
      'depends_on', coalesce((
        select json_agg(distinct dn.nspname || '.' || dc.relname)
        from pg_catalog.pg_rewrite r
        join pg_catalog.pg_depend d
          on d.classid = 'pg_catalog.pg_rewrite'::regclass and d.objid = r.oid
          and d.refclassid = 'pg_catalog.pg_class'::regclass
        join pg_catalog.pg_class dc on dc.oid = d.refobjid and dc.oid <> c.oid
        join pg_catalog.pg_namespace dn on dn.oid = dc.relnamespace
        where r.ev_class = c.oid
      ), '[]'::json)
    ) order by c.relname)
    from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and not exists (
        select 1 from pg_catalog.pg_depend e
        where e.classid = 'pg_catalog.pg_class'::regclass
          and e.objid = c.oid and e.deptype = 'e'
      )
  ), '[]'::json),
  'private_relations', coalesce((
    select json_agg(c.relname order by c.relname)
    from pg_catalog.pg_class c
    where c.relnamespace = 'private'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  ), '[]'::json),
  'default_acl', coalesce((
    select json_agg(json_build_object(
      'owner', pg_catalog.pg_get_userbyid(d.defaclrole),
      'scope', case d.defaclnamespace when 0 then 'global' else 'public' end,
      'objtype', d.defaclobjtype,
      'grants', coalesce((
        select json_agg(json_build_object(
          'grantee', case a.grantee when 0 then 'PUBLIC'
            else pg_catalog.pg_get_userbyid(a.grantee) end,
          'privilege', a.privilege_type))
        from pg_catalog.aclexplode(d.defaclacl) a
      ), '[]'::json)
    ) order by d.defaclrole, d.defaclnamespace, d.defaclobjtype)
    from pg_catalog.pg_default_acl d
    where d.defaclnamespace in (0, 'public'::regnamespace)
  ), '[]'::json)
);
rollback;
`;

const kindOf = (relkind) =>
  relkind === 'v' || relkind === 'm' ? 'view' : 'table';

/**
 * Compare a catalog document with the allowlist. Returns { errors, warnings }.
 */
export function evaluatePublicSchemaCatalog(catalog, allowlist) {
  const errors = [];
  const warnings = [];
  const compat = allowlist.serviceRoleCompatViews;
  const actual = new Map(catalog.relations.map((r) => [r.name, r]));
  const privateNames = new Set(catalog.private_relations);

  // G1: public application relations equal the allowlist.
  for (const relation of catalog.relations) {
    if (Object.hasOwn(compat, relation.name)) continue;
    const entry = allowlist.relations[relation.name];
    if (!entry)
      errors.push(
        `public.${relation.name} exists but is not allowlisted; create it in private`
      );
    else if (entry.kind !== kindOf(relation.relkind))
      errors.push(
        `public.${relation.name} is a ${kindOf(relation.relkind)}, allowlisted as ${entry.kind}`
      );
  }
  // Retained relations exist in hosted databases but not in the migration
  // chain, so a replay lacks them; one that appears must drop the flag.
  for (const [name, entry] of Object.entries(allowlist.relations)) {
    if (entry.retained && actual.has(name))
      errors.push(
        `relations.${name} is marked retained but the migration chain creates it; remove the flag`
      );
    else if (!entry.retained && !actual.has(name))
      errors.push(
        `relations.${name} is stale: public.${name} does not exist; remove it and record the move`
      );
  }
  for (const name of Object.keys(allowlist.moved)) {
    if (actual.has(name)) errors.push(`moved.${name} still exists in public`);
    if (!privateNames.has(name))
      errors.push(`moved.${name} does not exist in private`);
  }

  // G2: RLS on every public table, no client grants without RLS, no client
  // default privileges.
  for (const relation of catalog.relations) {
    const clients = relation.grantees.filter((g) => CLIENT_ROLES.has(g));
    const isTable = relation.relkind === 'r' || relation.relkind === 'p';
    if (isTable && !relation.rls)
      errors.push(`public.${relation.name} has row level security disabled`);
    if (
      (isTable || relation.relkind === 'f') &&
      !relation.rls &&
      clients.length
    )
      errors.push(
        `public.${relation.name} grants ${clients.join(', ')} without row level security`
      );
  }
  for (const row of catalog.default_acl) {
    const clients = row.grants.filter((g) => CLIENT_ROLES.has(g.grantee));
    if (!clients.length) continue;
    const where = `${row.scope} default ACL for ${row.owner} (objtype ${row.objtype})`;
    const names = [...new Set(clients.map((g) => g.grantee))].join(', ');
    if (Object.hasOwn(allowlist.defaultAclExemptOwners, row.owner)) {
      warnings.push(`${where} grants ${names} (exempt owner)`);
      continue;
    }
    if (row.objtype === 'f') {
      const strict = clients.filter((g) => g.grantee !== 'authenticated');
      if (strict.length || allowlist.functions.enforced)
        errors.push(`${where} grants EXECUTE to ${names}`);
      else
        warnings.push(
          `${where} grants EXECUTE to authenticated (allowed until functions are enforced)`
        );
    } else if (row.objtype === 'T' || row.objtype === 'n') {
      warnings.push(`${where} grants ${names}`);
    } else {
      errors.push(`${where} grants ${names}`);
    }
  }

  // G5: compat views are service-role only and read their private target.
  for (const message of expiredCompatViews(allowlist)) errors.push(message);
  for (const [name, entry] of Object.entries(compat)) {
    const view = actual.get(name);
    if (!view) {
      errors.push(`serviceRoleCompatViews.${name} does not exist in public`);
      continue;
    }
    if (view.relkind !== 'v')
      errors.push(`serviceRoleCompatViews.${name} is not a plain view`);
    const clients = view.grantees.filter((g) => CLIENT_ROLES.has(g));
    if (clients.length)
      errors.push(
        `serviceRoleCompatViews.${name} grants ${clients.join(', ')}`
      );
    if (view.depends_on.length !== 1 || view.depends_on[0] !== entry.target)
      errors.push(
        `serviceRoleCompatViews.${name} must read only ${entry.target}`
      );
  }
  return { errors, warnings };
}

/** Extract the JSON document from psql -A -t output (BEGIN/SET/ROLLBACK lines). */
export function parseCatalogOutput(stdout) {
  const line = stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .find((value) => value.startsWith('{'));
  if (!line) throw new Error('Catalog query returned no JSON document');
  const catalog = JSON.parse(line);
  for (const key of ['relations', 'private_relations', 'default_acl'])
    if (!Array.isArray(catalog[key]))
      throw new Error(`Catalog document lacks ${key}`);
  return catalog;
}
