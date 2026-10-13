import 'server-only';
import { z } from 'zod';
import { verifyEmployeeDatabaseReadiness } from './employee-creation-database-readiness';
import type { EmployeeCreationOperations } from './employee-creation-orchestration';
import type { EmployeeSqlQuery } from './employee-sql-catalog-readiness';
import { parseManagedAccountAddress } from './managed-address';

export type { EmployeeSqlQuery } from './employee-sql-catalog-readiness';

const IdentitySchema = z
  .object({
    actorUserId: z.guid(),
    userId: z.guid(),
    email: z.string().refine((value) => {
      const address = parseManagedAccountAddress(value);
      return address?.isRoot === true && address.address === value;
    }),
  })
  .strict();
const NamedIdentitySchema = IdentitySchema.extend({
  displayName: z.string().trim().min(1).max(100),
});
const NamedReceiptSchema = z
  .object({
    id: z.guid(),
    email: z.string(),
    displayName: z.string().min(1).max(100),
    status: z.enum(['pending', 'created']),
  })
  .strict();
const RowsSchema = z
  .array(z.object({ result: z.unknown() }).strict())
  .length(1);
const RoleRowsSchema = z
  .array(
    z
      .object({
        role: z.literal('service_role'),
        jwt_role: z.literal('service_role'),
        subject: z.null(),
        claims: z.object({ role: z.literal('service_role') }).strict(),
      })
      .strict()
  )
  .length(1);
export type EmployeeSqlEnvelope = {
  data: unknown;
  error: null | { code: string };
};

const TransportQualificationSchema = z
  .object({
    kind: z.literal('qualified-exclusive-owned'),
    deadlineMs: z.literal(15_000),
    poolAndBeginBounded: z.literal(true),
    statementsAndLocksBounded: z.literal(true),
    commitAcknowledgementBounded: z.literal(true),
    exactOwnedAbortAndDrain: z.literal(true),
  })
  .strict();
/** Required supplier contract only. No concrete driver transport is implemented or qualified. */
export type EmployeeSqlTransactions = {
  qualification: z.infer<typeof TransportQualificationSchema>;
  run(
    work: (query: EmployeeSqlQuery) => Promise<EmployeeSqlEnvelope>
  ): Promise<
    | { kind: 'committed'; reply: EmployeeSqlEnvelope }
    | { kind: 'aborted'; error: unknown }
    | { kind: 'commit_unknown' }
  >;
};
const TransactionOutcomeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('committed'),
      reply: z.object({ data: z.unknown(), error: z.null() }).strict(),
    })
    .strict(),
  z.object({ kind: z.literal('aborted'), error: z.unknown() }).strict(),
  z.object({ kind: z.literal('commit_unknown') }).strict(),
]);

const unavailable = (): EmployeeSqlEnvelope => ({
  data: null,
  error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
});
function sanitizedError(error: unknown): EmployeeSqlEnvelope {
  const descriptor =
    typeof error === 'object' && error !== null
      ? Object.getOwnPropertyDescriptor(error, 'code')
      : undefined;
  const code = descriptor?.value;
  return {
    data: null,
    error: {
      code:
        typeof code === 'string' && ['23505', '42501'].includes(code)
          ? code
          : 'EMPLOYEE_SCHEMA_UNAVAILABLE',
    },
  };
}

const EMPLOYEE_SQL_COMMITTED_READINESS_UNAVAILABLE =
  'employee_sql_committed_readiness_unavailable';

/** One authenticated creation request. No provider operations or recovery claims. */
export function createEmployeeCreationSqlOperations({
  actorUserId,
  transactions,
  readReadiness,
  requirements,
  clock = Date.now,
}: {
  actorUserId: string;
  transactions?: EmployeeSqlTransactions;
  readReadiness: () => PromiseLike<unknown>;
  requirements: unknown;
  clock?: () => number;
}): EmployeeCreationOperations {
  let bound: z.infer<typeof NamedIdentitySchema> | null = null;
  const execute = async (
    args: unknown,
    phase: 'preflight' | 'finalize' | 'confirm'
  ): Promise<EmployeeSqlEnvelope> => {
    if (
      !transactions ||
      !TransportQualificationSchema.safeParse(transactions.qualification)
        .success
    )
      return unavailable();
    const namedIdentity =
      phase === 'confirm' ? null : NamedIdentitySchema.safeParse(args);
    const parsed = namedIdentity ?? IdentitySchema.safeParse(args);
    if (
      !parsed.success ||
      parsed.data.actorUserId !== actorUserId ||
      !z.guid().safeParse(actorUserId).success
    )
      return unavailable();
    const identity = parsed.data;
    const displayName = namedIdentity?.success
      ? namedIdentity.data.displayName
      : undefined;
    if (
      (phase !== 'preflight' && !bound) ||
      (bound &&
        (bound.userId !== identity.userId ||
          bound.email !== identity.email ||
          (displayName !== undefined && bound.displayName !== displayName)))
    )
      return unavailable();
    try {
      const assertFreshReadiness = async () => {
        const ready = verifyEmployeeDatabaseReadiness({
          proof: await readReadiness(),
          requirements,
          now: clock(),
        });
        if (ready.kind !== 'ready')
          throw new Error('Employee schema acknowledgement unavailable');
      };
      await assertFreshReadiness();
      const outcome = await transactions.run(async (query) => {
        await assertFreshReadiness();
        // Server-side cancellation bounds actual SQL and lock waits, not pool acquisition.
        await query`set local statement_timeout = '5s'`;
        await query`set local lock_timeout = '2s'`;
        await query`set local idle_in_transaction_session_timeout = '5s'`;
        await query`set local role service_role`;
        // Maintenance context is transaction-local; no end-user JWT actor is inherited.
        await query`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
        if (
          !RoleRowsSchema.safeParse(
            await query`select current_user as role, auth.role() as jwt_role, nullif(current_setting('request.jwt.claim.sub', true), '') as subject, current_setting('request.jwt.claims', true)::jsonb as claims`
          ).success
        )
          throw new Error('Employee schema acknowledgement unavailable');
        await assertFreshReadiness();
        let rows: unknown;
        if (phase === 'preflight' && displayName !== undefined) {
          rows =
            await query`select private.employee_creation_preflight(${identity.actorUserId}::uuid, ${identity.userId}::uuid, ${identity.email}::text, ${displayName}::text) as result`;
        } else if (phase === 'finalize' && displayName !== undefined) {
          rows =
            await query`select private.finalize_employee_creation(${identity.actorUserId}::uuid, ${identity.userId}::uuid, ${identity.email}::text, ${displayName}::text) as result`;
        } else if (phase === 'confirm') {
          rows =
            await query`select private.confirm_employee_activation(${identity.actorUserId}::uuid, ${identity.userId}::uuid, ${identity.email}::text) as result`;
        } else throw new Error('Employee schema acknowledgement unavailable');
        await assertFreshReadiness();
        const reply = RowsSchema.safeParse(rows);
        if (!reply.success)
          throw new Error('Employee schema acknowledgement unavailable');
        const value = reply.data[0]?.result;
        if (phase === 'preflight') {
          if (value !== true)
            throw new Error('Employee schema acknowledgement unavailable');
          return { data: true, error: null };
        }
        const receipt = NamedReceiptSchema.safeParse(value);
        if (
          !receipt.success ||
          receipt.data.id !== identity.userId ||
          receipt.data.email !== identity.email ||
          receipt.data.displayName !== bound?.displayName ||
          receipt.data.status !== (phase === 'finalize' ? 'pending' : 'created')
        )
          throw new Error('Employee schema acknowledgement unavailable');
        return { data: receipt.data, error: null };
      });
      const committed = TransactionOutcomeSchema.safeParse(outcome);
      if (!committed.success || committed.data.kind === 'commit_unknown')
        return unavailable();
      if (committed.data.kind === 'aborted')
        return sanitizedError(committed.data.error);
      const result = committed.data.reply;
      if (phase === 'preflight') {
        if (result.data !== true) return unavailable();
      } else {
        const receipt = NamedReceiptSchema.safeParse(result.data);
        if (
          !receipt.success ||
          receipt.data.id !== identity.userId ||
          receipt.data.email !== identity.email ||
          receipt.data.displayName !== bound?.displayName ||
          receipt.data.status !== (phase === 'finalize' ? 'pending' : 'created')
        )
          return unavailable();
      }
      try {
        await assertFreshReadiness();
      } catch {
        // SQL commit was acknowledged; lost freshness blocks activation, not commit knowledge.
        return {
          data: result.data,
          error: { code: EMPLOYEE_SQL_COMMITTED_READINESS_UNAVAILABLE },
        };
      }
      if (
        result.error === null &&
        phase === 'preflight' &&
        namedIdentity?.success
      )
        bound = namedIdentity.data;
      return result;
    } catch (error) {
      return sanitizedError(error);
    }
  };
  return {
    preflight: (args) => execute(args, 'preflight'),
    finalize: (args) => execute(args, 'finalize'),
    confirmActivation: (args) => execute(args, 'confirm'),
  };
}
