import { z } from 'zod';
export const CatalogSql = Object.freeze([
  "select current_user as role, auth.role() as \"jwtRole\", nullif(current_setting('request.jwt.claim.sub', true), '') as subject, current_setting('request.jwt.claims', true)::jsonb as claims",
  'select system_identifier::text as "systemIdentifier" from pg_control_system()',
  "select has_schema_privilege('service_role', 'private', 'usage') as \"privateSchemaUsage\"",
  'select version from supabase_migrations.schema_migrations',
  "select pg_get_functiondef(p.oid) as definition, pg_get_userbyid(p.proowner) as \"ownerRole\", p.prosecdef as \"securityDefiner\", (select substring(setting from 13) from unnest(p.proconfig) setting where setting like 'search_path=%') as \"searchPath\", has_function_privilege('service_role', p.oid, 'EXECUTE') as \"serviceExecute\", exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as \"publicExecute\", has_function_privilege('anon', p.oid, 'EXECUTE') as \"anonExecute\", has_function_privilege('authenticated', p.oid, 'EXECUTE') as \"authenticatedExecute\" from pg_proc p where p.oid = to_regprocedure($1)",
]);
export const Signatures = Object.freeze([
  'private.employee_creation_preflight(uuid,uuid,text,text)',
  'private.finalize_employee_creation(uuid,uuid,text,text)',
  'private.confirm_employee_activation(uuid,uuid,text)',
]);
const Id = z.string().uuid();
export const Identity = z
  .object({
    actorUserId: Id,
    userId: Id,
    email: z.string().regex(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@tuturuuu\.com$/),
    displayName: z.string().trim().min(1).max(100),
  })
  .strict();
export const Database = z
  .object({
    host: z.string().min(1).max(253),
    port: z.number().int().min(1).max(65535),
    database: z.string().min(1).max(100),
    user: z.string().min(1).max(100),
    password: z.string().min(1).max(4096),
    ca: z.string().max(32768).optional(),
  })
  .strict();
export const Start = z
  .object({
    kind: z.literal('start'),
    session: Id,
    phase: z.enum(['preflight', 'finalize', 'confirm']),
    identity: Identity,
    database: Database,
  })
  .strict();
export const Command = z.discriminatedUnion('kind', [
  Start,
  z
    .object({
      kind: z.literal('authorize'),
      session: Id,
      checkpoint: z.enum(['before-effect', 'before-commit']),
    })
    .strict(),
  z.object({ kind: z.literal('abort'), session: Id }).strict(),
  z
    .object({
      kind: z.literal('commit'),
      session: Id,
      expiresAt: z.number().finite().nonnegative(),
    })
    .strict(),
]);
const Row = z.record(z.string(), z.unknown());
export const Message = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('catalog'),
      session: Id,
      checkpoint: z.enum(['before-effect', 'before-commit']),
      peerCertificateSha256: z.string().regex(/^[a-f0-9]{64}$/),
      rows: z.array(z.array(Row)).length(7),
      result: z.unknown().optional(),
    })
    .strict(),
  z.object({ kind: z.literal('committing'), session: Id }).strict(),
  z
    .object({ kind: z.literal('committed'), session: Id, result: z.unknown() })
    .strict(),
  z.object({ kind: z.literal('aborted'), session: Id }).strict(),
]);
export function parseBounded(schema, input) {
  try {
    if (Buffer.byteLength(JSON.stringify(input)) > 262144) return null;
    const result = schema.safeParse(input);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function normalizeSql(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export function isWorkerCommitLive({ expiresAt, bornAt, now, monotonicNow }) {
  return (
    [expiresAt, bornAt, now, monotonicNow].every(Number.isFinite) &&
    now < expiresAt &&
    monotonicNow >= bornAt &&
    monotonicNow - bornAt < 13000
  );
}
