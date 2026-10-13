import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  EmployeeCreationOperationStore,
  EmployeeOperationPhase,
  EmployeeOperationSnapshot,
  EmployeePhaseReceipt,
} from './employee-creation-operation-store';
import { EmployeePhaseReceiptSchema } from './employee-creation-operation-store';
import type { EmployeeCreationConfiguration } from './employee-creation-readiness';
import type {
  EmployeeCreationSupplier,
  EmployeeCreationSupplierDependencies,
  EmployeeScopeSchema,
  EmployeeSqlReceipt,
  makeEmployeeCreationSupplier,
} from './employee-creation-supplier';

const TupleSchema = z
  .object({
    actorUserId: z.uuid(),
    operationId: z.uuid(),
    targetUserId: z.uuid(),
    email: z.email(),
    displayName: z.string().min(1).max(100),
  })
  .strict();
const SqlReceiptSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string(),
    status: z.enum(['pending', 'created']),
  })
  .strict();
const AuthFactSchema = z
  .object({
    kind: z.literal('auth'),
    resourceId: z.uuid(),
    email: z.email(),
    state: z.enum(['banned', 'active']),
    confirmedAt: z.string(),
    onboarding: z.literal(true),
  })
  .strict();
const SqlFactSchema = z
  .object({
    kind: z.literal('sql'),
    phase: z.enum(['finalize', 'confirm']),
    receipt: SqlReceiptSchema,
    definitionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const EmployeeKnownFactSchema = z.discriminatedUnion('kind', [
  AuthFactSchema,
  SqlFactSchema,
]);
export type EmployeeKnownFact = z.infer<typeof EmployeeKnownFactSchema>;
export const EmployeePhaseResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('qualified'),
      receipt: EmployeePhaseReceiptSchema,
      facts: z.array(EmployeeKnownFactSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('halted'),
      facts: z.array(EmployeeKnownFactSchema).min(1),
      continuationAllowed: z.literal(false),
    })
    .strict(),
  z.object({ kind: z.literal('denied') }).strict(),
  z.object({ kind: z.literal('conflict') }).strict(),
  z.object({ kind: z.literal('unknown') }).strict(),
]);
export type EmployeePhaseResult = z.infer<typeof EmployeePhaseResultSchema>;
type AttemptPhase =
  | 'auth_attempted'
  | 'finalize_attempted'
  | 'activation_attempted';
type PhaseInput = { operation: EmployeeOperationSnapshot; capability: object };
export type EmployeePhaseSession = {
  advance(
    phase: EmployeeOperationPhase,
    receipt: EmployeePhaseReceipt | null,
    eventId: string
  ): Promise<{
    kind: 'advanced' | 'inspect';
    operation: EmployeeOperationSnapshot;
    capability: object | null;
  }>;
  handoff(input: PhaseInput): boolean;
  createPending(
    input: PhaseInput & { temporaryPassword: string }
  ): Promise<EmployeePhaseResult>;
  finalize(input: PhaseInput): Promise<EmployeePhaseResult>;
  activateAndConfirm(input: PhaseInput): Promise<EmployeePhaseResult>;
};
export type EmployeeCreationPhaseAdapter = {
  available(actorUserId: string): Promise<boolean>;
  beginInvocation(input: {
    store: EmployeeCreationOperationStore;
    operation: EmployeeOperationSnapshot;
  }): EmployeePhaseSession;
};
const DefinitionSchema = z
  .object({
    signature: z.string(),
    definition: z.string(),
    owner: z.string(),
    searchPath: z.literal(''),
    executeRoles: z.array(z.string()),
  })
  .strict();
const CertificateSchema = z
  .object({
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    projectRef: z.string().regex(/^[a-z]{20}$/),
    configurationSha256: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: z.number().finite(),
    expiresAt: z.number().finite(),
    finalize: DefinitionSchema,
    confirm: DefinitionSchema,
  })
  .strict();
export type EmployeePhaseCertificate = z.infer<typeof CertificateSchema>;
export type EmployeePhaseAdapterDependencies = {
  makeSupplier: typeof makeEmployeeCreationSupplier;
  scopeSchema: typeof EmployeeScopeSchema;
  supplier: Omit<
    EmployeeCreationSupplierDependencies,
    'consumeCreatePermission'
  >;
  certificate(): Promise<unknown>;
  verifyCertificate(
    certificate: EmployeePhaseCertificate,
    configuration: EmployeeCreationConfiguration,
    auth: EmployeeCreationSupplierDependencies['auth']
  ): Promise<boolean>;
  currentConfigurationSha256(): string;
  expected: {
    sourceSha: string;
    projectRef: string;
    finalize: { sha256: string; owner: string };
    confirm: { sha256: string; owner: string };
  };
};
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  return value;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function tuple(operation: EmployeeOperationSnapshot) {
  return TupleSchema.parse({
    actorUserId: operation.actorUserId,
    operationId: operation.operationId,
    targetUserId: operation.targetUserId,
    email: operation.email,
    displayName: operation.displayName,
  });
}
function attempt(phase: EmployeeOperationPhase): phase is AttemptPhase {
  return (
    phase === 'auth_attempted' ||
    phase === 'finalize_attempted' ||
    phase === 'activation_attempted'
  );
}
const signatures = {
  finalize: 'private.finalize_employee_creation(uuid,uuid,text,text)',
  confirm: 'private.confirm_employee_activation(uuid,uuid,text)',
};
/** Caller injects the actual immutable supplier factory and qualified ports. No
 * product copy/import loader, verifier issuer, executor extraction or live adapter. */
export function createEmployeeCreationPhaseAdapter(
  deps?: EmployeePhaseAdapterDependencies
): EmployeeCreationPhaseAdapter {
  async function qualification(audit?: () => Promise<unknown>) {
    if (
      !deps?.scopeSchema ||
      !deps.makeSupplier ||
      !deps.verifyCertificate ||
      !deps.currentConfigurationSha256
    )
      return null;
    try {
      const readiness = await deps.supplier.readiness();
      if (readiness.kind !== 'qualified') return null;
      if (audit) await audit();
      const parsed = CertificateSchema.safeParse(await deps.certificate());
      if (audit) await audit();
      if (!parsed.success) return null;
      const certificate = parsed.data;
      const configHash = digest(JSON.stringify(readiness.configuration));
      const live = () => {
        const time = deps.supplier.now();
        return (
          Number.isFinite(time) &&
          Number.isFinite(readiness.observedAt) &&
          Number.isFinite(readiness.expiresAt) &&
          readiness.expiresAt - readiness.observedAt <= 600000 &&
          time >= readiness.observedAt &&
          time < readiness.expiresAt &&
          time >= certificate.observedAt &&
          time < certificate.expiresAt &&
          certificate.expiresAt - certificate.observedAt <= 60_000 &&
          certificate.configurationSha256 === configHash &&
          deps.currentConfigurationSha256() === configHash
        );
      };
      if (
        !live() ||
        certificate.sourceSha !== deps.expected.sourceSha ||
        certificate.projectRef !== deps.expected.projectRef
      )
        return null;
      for (const phase of ['finalize', 'confirm'] as const) {
        const definition = certificate[phase];
        if (
          definition.signature !== signatures[phase] ||
          definition.owner !== deps.expected[phase].owner ||
          !same(definition.executeRoles, ['service_role']) ||
          digest(definition.definition) !== deps.expected[phase].sha256
        )
          return null;
      }
      const verified = await deps.verifyCertificate(
        certificate,
        readiness.configuration,
        deps.supplier.auth
      );
      if (audit) await audit();
      if (!verified || !live()) return null;
      return { readiness, certificate, live };
    } catch {
      return null;
    }
  }
  return {
    async available() {
      return Boolean(await qualification());
    },
    beginInvocation({ store, operation: initial }) {
      let current = structuredClone(initial);
      const originalInvocation =
        initial.phase === 'reserved' && !initial.revoked;
      type Entry = {
        operation: EmployeeOperationSnapshot;
        eventId: string;
        handed: boolean;
        used: boolean;
        createConsumed: boolean;
        preflight: boolean;
      };
      const registry = new WeakMap<object, Entry>();
      const qualified = new Map<AttemptPhase, EmployeePhaseReceipt>();
      let pending: {
        receipt: EmployeeSqlReceipt;
        projected: EmployeePhaseReceipt;
        provisioned: EmployeeOperationSnapshot | null;
      } | null = null;
      function captured(input: PhaseInput, phase?: AttemptPhase) {
        const entry = registry.get(input.capability);
        return entry &&
          same(entry.operation, input.operation) &&
          same(current, entry.operation) &&
          (!phase || entry.operation.phase === phase)
          ? entry
          : null;
      }
      async function run(
        input: PhaseInput,
        phase: AttemptPhase,
        password?: string
      ): Promise<EmployeePhaseResult> {
        const entry = captured(input, phase);
        if (!deps || !entry?.handed || entry.used) return { kind: 'denied' };
        const boundDeps = deps;
        const admission = entry;
        admission.used = true;
        const original = Object.freeze(tuple(admission.operation));
        const facts: EmployeeKnownFact[] = [];
        let auth: z.infer<typeof AuthFactSchema> | null = null;
        let sqlFact: z.infer<typeof SqlFactSchema> | null = null;
        let currentQualification: Awaited<ReturnType<typeof qualification>> =
          null;
        function halt(
          fallback: 'denied' | 'unknown' | 'conflict' = 'denied'
        ): EmployeePhaseResult {
          return facts.length
            ? {
                kind: 'halted',
                facts: structuredClone(facts),
                continuationAllowed: false,
              }
            : { kind: fallback };
        }
        async function currentScope() {
          try {
            currentQualification = await qualification(() =>
              store.assertAuthority(admission.operation)
            );
            if (!currentQualification) return null;
            await store.assertAuthority(admission.operation);
            const scope = boundDeps.scopeSchema.safeParse(
              await boundDeps.supplier.scope(original)
            );
            await store.assertAuthority(admission.operation);
            return scope.success &&
              same(scope.data.operation, original) &&
              currentQualification.live()
              ? scope.data
              : null;
          } catch {
            return null;
          }
        }
        async function observeAuth(
          value: Awaited<
            ReturnType<
              EmployeeCreationSupplierDependencies['auth']['createUser']
            >
          >
        ) {
          auth = null;
          if (value.error) return value;
          const user = z
            .object({
              id: z.uuid(),
              email: z.email(),
              email_confirmed_at: z.string(),
              banned_until: z.string().nullish(),
              app_metadata: z.object({ employee_onboarding: z.literal(true) }),
            })
            .safeParse(value.data.user);
          const time = boundDeps.supplier.now();
          if (
            !user.success ||
            !Number.isFinite(time) ||
            user.data.id !== original.targetUserId ||
            user.data.email !== original.email ||
            !Number.isFinite(Date.parse(user.data.email_confirmed_at))
          )
            return value;
          const ban = user.data.banned_until
            ? Date.parse(user.data.banned_until)
            : null;
          if (ban !== null && !Number.isFinite(ban)) return value;
          auth = {
            kind: 'auth',
            resourceId: user.data.id,
            email: user.data.email,
            confirmedAt: user.data.email_confirmed_at,
            onboarding: true,
            state: ban !== null && ban > time ? 'banned' : 'active',
          };
          facts.push(auth);
          return value;
        }
        const supplier: EmployeeCreationSupplier = boundDeps.makeSupplier({
          ...boundDeps.supplier,
          readiness: async () => {
            const q = await qualification(() =>
              store.assertAuthority(admission.operation)
            );
            try {
              await store.assertAuthority(admission.operation);
            } catch {
              return { kind: 'denied' };
            }
            return q?.live() ? q.readiness : { kind: 'denied' };
          },
          scope: async () => currentScope(),
          auth: {
            createUser: async (input) =>
              observeAuth(await boundDeps.supplier.auth.createUser(input)),
            getUserById: async (id) =>
              observeAuth(await boundDeps.supplier.auth.getUserById(id)),
            updateUserById: async (id, attributes) =>
              observeAuth(
                await boundDeps.supplier.auth.updateUserById(id, attributes)
              ),
          },
          executeFixedEmployeeSql: async (input) => {
            if (!(await currentScope()) || !currentQualification)
              return { kind: 'denied' };
            const q = currentQualification;
            if (
              !same(input.identity, {
                actorUserId: original.actorUserId,
                userId: original.targetUserId,
                email: original.email,
                displayName: original.displayName,
              }) ||
              digest(
                JSON.stringify({
                  database: input.database,
                  requirements: input.requirements,
                  signedProjectBinding: input.signedProjectBinding,
                  executionQualification: input.executionQualification,
                  trustedOperatorPublicKey: input.trustedOperatorPublicKey,
                })
              ) !== q.certificate.configurationSha256
            )
              return { kind: 'denied' };
            const result =
              await boundDeps.supplier.executeFixedEmployeeSql(input);
            if (result.kind === 'committed') {
              if (input.phase === 'preflight')
                admission.preflight = result.result === true;
              else {
                const parsed = SqlReceiptSchema.safeParse(result.result);
                if (
                  parsed.success &&
                  parsed.data.id === original.targetUserId &&
                  parsed.data.email === original.email &&
                  parsed.data.displayName === original.displayName &&
                  parsed.data.status ===
                    (input.phase === 'finalize' ? 'pending' : 'created')
                ) {
                  sqlFact = {
                    kind: 'sql',
                    phase: input.phase,
                    receipt: parsed.data,
                    definitionSha256: digest(
                      q.certificate[input.phase].definition
                    ),
                  };
                  facts.push(sqlFact);
                }
              }
            }
            return result;
          },
          consumeCreatePermission: async (operation) => {
            if (
              !same(operation, original) ||
              !admission.preflight ||
              admission.createConsumed ||
              !(await currentScope()) ||
              admission.createConsumed
            )
              return false;
            admission.createConsumed = true;
            return true;
          },
        });
        try {
          let outcome: Awaited<
            ReturnType<EmployeeCreationSupplier['activate']>
          >;
          if (phase === 'auth_attempted') {
            const preflight = await supplier.preflight(original);
            if (
              preflight.kind !== 'committed' ||
              preflight.result !== true ||
              !preflight.continuationAllowed
            )
              return halt(
                preflight.kind === 'commit_unknown' ? 'unknown' : 'denied'
              );
            outcome = await supplier.createOnce(original, password);
          } else if (phase === 'finalize_attempted')
            outcome = await supplier.finalize(original);
          else {
            if (
              !pending?.provisioned ||
              !same(pending.provisioned.lastReceipt, pending.projected) ||
              pending.provisioned.version + 1 !== admission.operation.version ||
              pending.provisioned.leaseId !== admission.operation.leaseId
            )
              return { kind: 'denied' };
            outcome = await supplier.activate(original, {
              operation: original,
              receipt: pending.receipt,
            });
          }
          if (outcome.kind === 'provider_conflict') return halt('conflict');
          if (
            outcome.kind === 'provider_unknown' ||
            outcome.kind === 'commit_unknown'
          )
            return halt('unknown');
          if (outcome.kind !== 'verified' && outcome.kind !== 'committed')
            return halt();
          if (!outcome.continuationAllowed || !(await currentScope()))
            return halt();
          // Observations are assigned inside same-call wrappers; do not project
          // from requested UUID/flags or a supplier's generic verified label.
          const observedAuth = AuthFactSchema.safeParse(auth);
          const observedSql = SqlFactSchema.safeParse(sqlFact);
          const active = phase === 'activation_attempted';
          const sql = phase !== 'auth_attempted';
          if (
            !observedAuth.success ||
            observedAuth.data.state !== (active ? 'active' : 'banned') ||
            (sql &&
              (!observedSql.success ||
                observedSql.data.phase !== (active ? 'confirm' : 'finalize') ||
                outcome.kind !== 'committed' ||
                !same(outcome.result, observedSql.data.receipt)))
          )
            return halt('unknown');
          const receipt: EmployeePhaseReceipt = {
            targetUserId: observedAuth.data.resourceId,
            email: observedAuth.data.email,
            providerReceiptId: observedAuth.data.resourceId,
            authConfirmed: true,
            authPending: !active,
            providerActive: active,
            sqlConfirmed: sql,
            profilesConfirmed: sql,
            mailboxConfirmed: sql,
            grantsConfirmed: sql,
          };
          qualified.set(phase, receipt);
          if (phase === 'finalize_attempted' && observedSql.success)
            pending = {
              receipt: observedSql.data.receipt,
              projected: receipt,
              provisioned: null,
            };
          return { kind: 'qualified', receipt, facts: structuredClone(facts) };
        } catch {
          return halt('unknown');
        }
      }
      return {
        async advance(phase, receipt, eventId) {
          if (!originalInvocation)
            throw new Error('Restarted invocation requires inspection');
          if (
            (phase === 'auth_confirmed' &&
              !same(receipt, qualified.get('auth_attempted'))) ||
            (phase === 'provisioned' &&
              (!pending || !same(receipt, pending.projected))) ||
            (phase === 'active' &&
              !same(receipt, qualified.get('activation_attempted'))) ||
            (phase === 'activation_attempted' &&
              (!pending?.provisioned || !same(current, pending.provisioned)))
          )
            throw new Error('Phase proof is unavailable');
          const id = z.uuid().parse(eventId);
          const result = await store.advance(current, phase, receipt, id);
          current = result.operation;
          let capability: object | null = null;
          if (result.kind === 'advanced') {
            if (phase === 'provisioned' && pending)
              pending.provisioned = structuredClone(current);
            if (attempt(phase)) {
              capability = Object.freeze({});
              registry.set(capability, {
                operation: structuredClone(current),
                eventId: id,
                handed: false,
                used: false,
                createConsumed: false,
                preflight: false,
              });
            }
          }
          return { ...result, capability };
        },
        handoff(input) {
          const entry = captured(input);
          if (!entry || entry.handed) return false;
          entry.handed = true;
          return true;
        },
        createPending: (input) =>
          run(input, 'auth_attempted', input.temporaryPassword),
        finalize: (input) => run(input, 'finalize_attempted'),
        activateAndConfirm: (input) => run(input, 'activation_attempted'),
      };
    },
  };
}
