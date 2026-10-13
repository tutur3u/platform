import { z } from 'zod';

export const EMPLOYEE_CREATION_SIGNATURES = [
  'private.employee_creation_preflight(uuid,uuid,text,text)',
  'private.finalize_employee_creation(uuid,uuid,text,text)',
  'private.confirm_employee_activation(uuid,uuid,text)',
] as const;
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const SourceSha = z.string().regex(/^[a-f0-9]{40}$/);
const FunctionBinding = z
  .object({
    signature: z.enum(EMPLOYEE_CREATION_SIGNATURES),
    definitionHash: Sha256,
  })
  .strict();
export const EmployeeDatabaseRequirementsSchema = z
  .object({
    projectRef: z.string().regex(/^[a-z]{20}$/),
    contractRevision: z.literal(1),
    qualifiedSourceSha: SourceSha,
    migrations: z.array(z.string().regex(/^\d{14}$/)).min(2),
    functions: z.array(FunctionBinding).length(3),
  })
  .strict();
const ProofSchema = EmployeeDatabaseRequirementsSchema.extend({
  kind: z.literal('qualified'),
  connectionConfigured: z.literal(true),
  qualificationPassed: z.literal(true),
  executionRole: z.literal('service_role'),
  privateSchemaUsage: z.literal(true),
  publicExecute: z.literal(false),
  anonExecute: z.literal(false),
  authenticatedExecute: z.literal(false),
  functionExecutionAllowed: z.literal(true),
  observedAt: z.number().finite().nonnegative(),
  expiresAt: z.number().finite().nonnegative(),
}).strict();

export type EmployeeDatabaseRequirements = z.infer<
  typeof EmployeeDatabaseRequirementsSchema
>;
export type EmployeeDatabaseReadiness =
  | { kind: 'ready'; requirements: EmployeeDatabaseRequirements }
  | {
      kind: 'unavailable';
      reason: 'invalid_binding' | 'expired' | 'contract_mismatch';
    };

/** Validate server-owned observed proof. It never probes, configures or qualifies a database. */
export function verifyEmployeeDatabaseReadiness({
  proof,
  requirements,
  now,
}: {
  proof: unknown;
  requirements: unknown;
  now: number;
}): EmployeeDatabaseReadiness {
  const expected = EmployeeDatabaseRequirementsSchema.safeParse(requirements);
  const actual = ProofSchema.safeParse(proof);
  if (!expected.success || !actual.success || !Number.isFinite(now)) {
    return { kind: 'unavailable', reason: 'invalid_binding' };
  }
  const a = actual.data;
  const e = expected.data;
  if (
    a.observedAt > now ||
    a.expiresAt <= now ||
    now - a.observedAt > 60_000 ||
    a.expiresAt - a.observedAt > 60_000
  ) {
    return { kind: 'unavailable', reason: 'expired' };
  }
  const functions = new Map(
    a.functions.map((item) => [item.signature, item.definitionHash])
  );
  const expectedFunctions = new Map(
    e.functions.map((item) => [item.signature, item.definitionHash])
  );
  if (
    a.projectRef !== e.projectRef ||
    a.contractRevision !== e.contractRevision ||
    a.qualifiedSourceSha !== e.qualifiedSourceSha ||
    functions.size !== 3 ||
    expectedFunctions.size !== 3 ||
    e.functions.some(
      (item) => functions.get(item.signature) !== item.definitionHash
    ) ||
    new Set(e.migrations).size !== e.migrations.length ||
    new Set(a.migrations).size !== a.migrations.length ||
    e.migrations.some((version) => !a.migrations.includes(version))
  ) {
    return { kind: 'unavailable', reason: 'contract_mismatch' };
  }
  return { kind: 'ready', requirements: e };
}
