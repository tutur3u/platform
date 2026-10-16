import 'server-only';
import { Buffer } from 'node:buffer';
import { z } from 'zod';

/** Proposed SQL names and existing Auth names; values are never read here. */
export const EMPLOYEE_CREATION_ENV_NAMES = Object.freeze([
  'EMPLOYEE_SQL_HOST',
  'EMPLOYEE_SQL_PORT',
  'EMPLOYEE_SQL_DATABASE',
  'EMPLOYEE_SQL_USER',
  'EMPLOYEE_SQL_PASSWORD',
  'EMPLOYEE_SQL_CA',
  'EMPLOYEE_OPERATOR_PUBLIC_KEY',
  'EMPLOYEE_SIGNED_PROJECT_BINDING',
  'EMPLOYEE_EXECUTION_QUALIFICATION',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVER_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
]);

export const EMPLOYEE_CREATION_OPERATOR_MANIFEST = Object.freeze({
  sourceSha: '84ec8e04c4a412c7dd1501f2bb7ce14c0dda01ea',
  functions: [
    'private.employee_creation_preflight(uuid,uuid,text,text)',
    'private.finalize_employee_creation(uuid,uuid,text,text)',
    'private.confirm_employee_activation(uuid,uuid,text)',
  ],
  requiredEvidence: [
    'qualified schema, generated types and actual consumer receipts on exact source',
    'worker/protocol hashes and Linux connection/rollback/lock-drain qualification',
    'operator verified project/cluster system_identifier and TLS peer hash',
    'function definitions/hashes/owner/search_path/ACL and migration ledger',
    'private schema usage; service_role execute; no public/anon/authenticated execute',
    'transaction-local role/JWT service_role with empty subject on owned connection',
    'signed project binding and worker qualification, refreshed within 10 minutes',
    'catalog proof refreshed within 60 seconds before effect and COMMIT',
    'Auth project/service-role and caller-reserved UUID behavior qualification',
  ],
  bindingProposal:
    'Root injects the unchanged fixed worker executor and externally verified configuration; journal binds durable UUID, CAS phase receipts and one-time create permission. No arbitrary-query adapter or application-local orchestration import.',
});

const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Sha = z.string().regex(/^[a-f0-9]{40}$/);
export const EmployeeOperationSchema = z
  .object({
    operationId: z.uuid(),
    actorUserId: z.uuid(),
    targetUserId: z.uuid(),
    email: z
      .string()
      .max(320)
      .regex(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@tuturuuu\.com$/),
    displayName: z
      .string()
      .min(1)
      .max(100)
      .refine((v) => v === v.trim()),
  })
  .strict()
  .refine((v) => v.actorUserId !== v.targetUserId);
export type EmployeeOperation = z.infer<typeof EmployeeOperationSchema>;

const BoundedConfigurationObject = z
  .record(z.string(), z.json())
  .refine((value) => Buffer.byteLength(JSON.stringify(value)) <= 262144);
const ConfigurationSchema = z
  .object({
    database: z
      .object({
        host: z.string().min(1).max(253),
        port: z.number().int().min(1).max(65535),
        database: z.string().min(1).max(100),
        user: z.string().min(1).max(100),
        password: z.string().min(1).max(4096),
        ca: z.string().max(32768).optional(),
      })
      .strict(),
    requirements: BoundedConfigurationObject,
    signedProjectBinding: z
      .unknown()
      .refine((v) => v !== undefined && v !== null),
    executionQualification: z
      .unknown()
      .refine((v) => v !== undefined && v !== null),
    trustedOperatorPublicKey: z.string().min(1).max(8192),
  })
  .strict();

const EvidenceSchema = z
  .object({
    sourceSha: Sha,
    projectRef: z.string().regex(/^[a-z]{20}$/),
    serverHost: z.string().min(1).max(253),
    systemIdentifier: z.string().regex(/^[1-9][0-9]*$/),
    tlsPeerSha256: Digest,
    workerSha256: Digest,
    protocolSha256: Digest,
    requirementsSha256: Digest,
    providerProjectRef: z.string().regex(/^[a-z]{20}$/),
    schemaQualified: z.literal(true),
    typesQualified: z.literal(true),
    consumerQualified: z.literal(true),
    connectionQualified: z.literal(true),
    operatorQualified: z.literal(true),
    providerReservedUuidQualified: z.literal(true),
    serviceRoleQualified: z.literal(true),
    functionAclQualified: z.literal(true),
    observedAt: z.number().finite(),
    expiresAt: z.number().finite(),
  })
  .strict();
export type EmployeeCreationEvidence = z.infer<typeof EvidenceSchema>;
export type EmployeeCreationConfiguration = z.infer<typeof ConfigurationSchema>;
export type EmployeeEvidenceVerifier = (input: {
  configuration: EmployeeCreationConfiguration;
  evidence: EmployeeCreationEvidence;
}) => Promise<boolean>;

export type EmployeeReadiness =
  | { kind: 'denied' }
  | {
      kind: 'qualified';
      configuration: EmployeeCreationConfiguration;
      observedAt: number;
      expiresAt: number;
    };

/** Verification must independently bind all evidence to config, exact source,
 * provider project and signed worker/catalog contracts. It is an injected trusted
 * server port, not an issuer. Boolean flags or env presence alone cannot admit.
 * The worker still independently verifies signatures/catalog before effect/COMMIT.
 */
export async function loadEmployeeCreationReadiness(input: {
  configuration: unknown;
  evidence: unknown;
  expectedSourceSha: string;
  verify?: EmployeeEvidenceVerifier;
  now: () => number;
}): Promise<EmployeeReadiness> {
  try {
    const config = ConfigurationSchema.safeParse(input.configuration);
    const evidence = EvidenceSchema.safeParse(input.evidence);
    if (!config.success || !evidence.success || !input.verify)
      return { kind: 'denied' };
    const proof = evidence.data;
    const fresh = () => {
      const now = input.now();
      return (
        Number.isFinite(now) &&
        proof.observedAt <= now &&
        now < proof.expiresAt &&
        proof.expiresAt > proof.observedAt &&
        proof.expiresAt - proof.observedAt <= 600000
      );
    };
    if (
      !fresh() ||
      proof.sourceSha !== input.expectedSourceSha ||
      proof.serverHost !== config.data.database.host ||
      proof.projectRef !== proof.providerProjectRef
    )
      return { kind: 'denied' };
    if (
      !(await input.verify({ configuration: config.data, evidence: proof })) ||
      !fresh()
    )
      return { kind: 'denied' };
    return {
      kind: 'qualified',
      configuration: config.data,
      observedAt: proof.observedAt,
      expiresAt: proof.expiresAt,
    };
  } catch {
    return { kind: 'denied' };
  }
}
