import 'server-only';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import {
  EMPLOYEE_CREATION_SIGNATURES,
  EmployeeDatabaseRequirementsSchema,
  verifyEmployeeDatabaseReadiness,
} from './employee-creation-database-readiness';
import type { EmployeeSqlQuery } from './employee-creation-sql';

const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const PolicySchema = z
  .object({
    signature: z.enum(EMPLOYEE_CREATION_SIGNATURES),
    ownerRole: z.string().min(1),
    searchPath: z.string().min(1),
  })
  .strict();
const RequirementsSchema = z
  .object({
    database: EmployeeDatabaseRequirementsSchema,
    policies: z.array(PolicySchema).length(3),
  })
  .strict();
const BindingSchema = z
  .object({
    kind: z.literal('operator-qualified-project-binding'),
    projectRef: z.string().regex(/^[a-z]{20}$/),
    systemIdentifier: z.string().regex(/^[1-9][0-9]*$/),
    qualifiedSourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    requirementsHash: Digest,
    serverHost: z.string().min(1),
    peerCertificateSha256: Digest,
    observedAt: z.number().finite().nonnegative(),
    expiresAt: z.number().finite().nonnegative(),
  })
  .strict();
const SignedBindingSchema = z
  .object({
    payload: BindingSchema,
    signature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
const FunctionRowsSchema = z
  .array(
    z
      .object({
        definition: z.string().min(1),
        ownerRole: z.string(),
        securityDefiner: z.literal(true),
        searchPath: z.string(),
        serviceExecute: z.literal(true),
        publicExecute: z.literal(false),
        anonExecute: z.literal(false),
        authenticatedExecute: z.literal(false),
      })
      .strict()
  )
  .length(1);
const denied = () => ({ kind: 'unavailable' as const });
export type EmployeeCatalogContext = {
  query: EmployeeSqlQuery;
  signal: AbortSignal;
  deadlineAt: number;
  serverHost: string;
  peerCertificateSha256: string;
};

export function employeeCatalogRequirementsHash(
  requirements: unknown
): string | null {
  const parsed = RequirementsSchema.safeParse(requirements);
  if (!parsed.success) return null;
  const r = parsed.data;
  return createHash('sha256')
    .update(
      JSON.stringify({
        database: {
          ...r.database,
          migrations: [...r.database.migrations].sort(),
          functions: [...r.database.functions].sort((a, b) =>
            a.signature.localeCompare(b.signature)
          ),
        },
        policies: [...r.policies].sort((a, b) =>
          a.signature.localeCompare(b.signature)
        ),
      })
    )
    .digest('hex');
}
export function employeeProjectBindingPayloadBytes(
  payload: unknown
): Buffer | null {
  const parsed = BindingSchema.safeParse(payload);
  if (!parsed.success) return null;
  // Fixed property order: signer and verifier serialize the same versioned domain.
  const p = parsed.data;
  return Buffer.from(
    JSON.stringify([
      p.kind,
      p.projectRef,
      p.systemIdentifier,
      p.qualifiedSourceSha,
      p.requirementsHash,
      p.serverHost,
      p.peerCertificateSha256,
      p.observedAt,
      p.expiresAt,
    ])
  );
}
/** Read-only catalog observation on the caller's exact owned transaction connection.
 * The operator key/binding are trusted server configuration, never HTTP input.
 * This module does not issue attestation, grant access, configure a connection or wire readiness.
 */
export async function observeEmployeeSqlCatalog({
  context,
  requirements,
  signedProjectBinding,
  trustedOperatorPublicKey,
  clock = Date.now,
  monotonicClock = () => performance.now(),
}: {
  context: EmployeeCatalogContext;
  requirements: unknown;
  signedProjectBinding?: unknown;
  trustedOperatorPublicKey?: string;
  clock?: () => number;
  monotonicClock?: () => number;
}) {
  const r = RequirementsSchema.safeParse(requirements);
  const signed = SignedBindingSchema.safeParse(signedProjectBinding);
  if (!r.success || !signed.success || !trustedOperatorPublicKey)
    return denied();
  const p = signed.data.payload;
  const now = clock();
  const live = () =>
    !context.signal.aborted &&
    Number.isFinite(context.deadlineAt) &&
    monotonicClock() < context.deadlineAt;
  if (
    !live() ||
    !Number.isFinite(now) ||
    p.observedAt > now ||
    p.expiresAt <= now ||
    p.expiresAt - p.observedAt > 600_000 ||
    p.projectRef !== r.data.database.projectRef ||
    p.qualifiedSourceSha !== r.data.database.qualifiedSourceSha ||
    p.requirementsHash !== employeeCatalogRequirementsHash(r.data) ||
    p.serverHost !== context.serverHost ||
    p.peerCertificateSha256 !== context.peerCertificateSha256
  )
    return denied();
  const bytes = employeeProjectBindingPayloadBytes(p);
  if (!bytes) return denied();
  try {
    const key = createPublicKey(trustedOperatorPublicKey);
    if (
      key.asymmetricKeyType !== 'ed25519' ||
      !verify(null, bytes, key, Buffer.from(signed.data.signature, 'base64'))
    )
      return denied();
    const role = z
      .array(
        z
          .object({
            role: z.literal('service_role'),
            jwtRole: z.literal('service_role'),
            subject: z.null(),
            claims: z.object({ role: z.literal('service_role') }).strict(),
          })
          .strict()
      )
      .length(1)
      .safeParse(
        await context.query`select current_user as role, auth.role() as "jwtRole", nullif(current_setting('request.jwt.claim.sub', true), '') as subject, current_setting('request.jwt.claims', true)::jsonb as claims`
      );
    if (!live() || !role.success) return denied();
    const system = z
      .array(
        z
          .object({ systemIdentifier: z.string().regex(/^[1-9][0-9]*$/) })
          .strict()
      )
      .length(1)
      .safeParse(
        await context.query`select system_identifier::text as "systemIdentifier" from pg_control_system()`
      );
    if (
      !live() ||
      !system.success ||
      system.data[0]?.systemIdentifier !== p.systemIdentifier
    )
      return denied();
    const usage = z
      .array(z.object({ privateSchemaUsage: z.literal(true) }).strict())
      .length(1)
      .safeParse(
        await context.query`select has_schema_privilege('service_role', 'private', 'usage') as "privateSchemaUsage"`
      );
    if (!live() || !usage.success) return denied();
    const ledger = z
      .array(z.object({ version: z.string().regex(/^[0-9]{14}$/) }).strict())
      .safeParse(
        await context.query`select version from supabase_migrations.schema_migrations`
      );
    if (!live() || !ledger.success) return denied();
    const versions = ledger.data.map((row) => row.version);
    const functions: Array<{
      signature: (typeof EMPLOYEE_CREATION_SIGNATURES)[number];
      definitionHash: string;
    }> = [];
    for (const signature of EMPLOYEE_CREATION_SIGNATURES) {
      if (!live()) return denied();
      const rows = FunctionRowsSchema.safeParse(
        await context.query`select pg_get_functiondef(p.oid) as definition, pg_get_userbyid(p.proowner) as "ownerRole", p.prosecdef as "securityDefiner", (select substring(setting from 13) from unnest(p.proconfig) setting where setting like 'search_path=%') as "searchPath", has_function_privilege('service_role', p.oid, 'EXECUTE') as "serviceExecute", exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as "publicExecute", has_function_privilege('anon', p.oid, 'EXECUTE') as "anonExecute", has_function_privilege('authenticated', p.oid, 'EXECUTE') as "authenticatedExecute" from pg_proc p where p.oid = to_regprocedure(${signature})`
      );
      if (!live() || !rows.success) return denied();
      const row = rows.data[0];
      const policy = r.data.policies.find(
        (item) => item.signature === signature
      );
      if (
        !row ||
        !policy ||
        row.ownerRole !== policy.ownerRole ||
        row.searchPath !== policy.searchPath
      )
        return denied();
      functions.push({
        signature,
        definitionHash: createHash('sha256')
          .update(row.definition)
          .digest('hex'),
      });
    }
    const observedAt = clock();
    if (
      !live() ||
      !Number.isFinite(observedAt) ||
      observedAt < now ||
      observedAt >= p.expiresAt
    )
      return denied();
    const proof = {
      ...r.data.database,
      migrations: versions,
      functions,
      kind: 'qualified',
      connectionConfigured: true,
      qualificationPassed: true,
      executionRole: 'service_role',
      privateSchemaUsage: true,
      publicExecute: false,
      anonExecute: false,
      authenticatedExecute: false,
      functionExecutionAllowed: true,
      observedAt,
      expiresAt: Math.min(observedAt + 60_000, p.expiresAt),
    };
    return verifyEmployeeDatabaseReadiness({
      proof,
      requirements: r.data.database,
      now: observedAt,
    }).kind === 'ready'
      ? { kind: 'observed' as const, proof }
      : denied();
  } catch {
    return denied();
  }
}
