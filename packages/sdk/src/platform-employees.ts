import {
  createInternalApiClient,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';
import { z } from 'zod';

// Mirrors @tuturuuu/internal-api/infrastructure employee-creation; the CLI
// keeps its own narrow copy so it does not bundle the infrastructure barrel.
export const EMPLOYEES_ENDPOINT =
  '/api/v1/infrastructure/internal-accounts/employees';

export const employeeEmailSchema = z
  .string()
  .regex(/^(?!.*\.\.)[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@tuturuuu\.com$/u);

const uuid = z.uuid();
const replySchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('created'),
    operationId: uuid,
    account: z.strictObject({
      id: uuid,
      email: z.email(),
      displayName: z.string().min(1).max(100),
    }),
  }),
  z.strictObject({
    status: z.literal('pending'),
    operationId: uuid,
    code: z.enum([
      'account_creation_outcome_unknown',
      'employee_provisioning_pending',
    ]),
    nextAction: z.literal('inspect'),
  }),
  z.strictObject({
    status: z.literal('conflict'),
    operationId: uuid,
    code: z.enum([
      'employee_account_conflict',
      'employee_operation_payload_conflict',
    ]),
    nextAction: z.literal('inspect'),
  }),
]);
const notAdmittedSchema = z.object({
  status: z.literal('not_admitted'),
  reason: z.enum(['invalid_input', 'unavailable']),
  operationId: uuid,
});

export type EmployeeCreationReply = z.infer<typeof replySchema>;
export type EmployeeCreationResult =
  | EmployeeCreationReply
  | { status: 'not_admitted'; operationId: string; reason: string };

export interface CreateEmployeeInput {
  email: string;
  displayName: string;
  /** Transient execution input. Never print, log or persist it from here. */
  temporaryPassword: string;
}

/** Fixed headers of the creation POST; the CLI prints these in --dry-run. */
export function employeeCreationHeaders(operationId: string) {
  return {
    'Content-Type': 'application/json',
    'x-tuturuuu-account-action': '1',
    'Idempotency-Key': operationId,
  };
}

/** Root-staff employee creation. The server enforces every permission. */
export class EmployeesAdminClient {
  private readonly api;
  constructor(options: InternalApiClientOptions) {
    this.api = createInternalApiClient(options);
  }

  /** Read-only admission and journal probe; safe against production. */
  async availability(): Promise<
    { ok: true; available: boolean } | { ok: false; status: number }
  > {
    const response = await this.api.fetch(EMPLOYEES_ENDPOINT, {
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) return { ok: false, status: response.status };
    const body = z
      .strictObject({ available: z.boolean() })
      .safeParse(await response.json().catch(() => null));
    if (!body.success)
      throw new Error('Unexpected employee availability reply.');
    return { ok: true, available: body.data.available };
  }

  /**
   * One POST. Replaying the same operation ID and payload is the server's
   * documented re-entry path; it never repeats provider creation.
   */
  async create(
    input: CreateEmployeeInput,
    operationId: string
  ): Promise<EmployeeCreationResult> {
    uuid.parse(operationId);
    const email = employeeEmailSchema.parse(input.email);
    const response = await this.api.fetch(EMPLOYEES_ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: employeeCreationHeaders(operationId),
      body: JSON.stringify({
        email,
        displayName: input.displayName,
        temporaryPassword: input.temporaryPassword,
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 400 || response.status === 503) {
      const proof = notAdmittedSchema.safeParse(body);
      if (proof.success && proof.data.operationId === operationId)
        return {
          status: 'not_admitted',
          operationId,
          reason: proof.data.reason,
        };
    }
    const parsed = replySchema.safeParse(body);
    const expected = { created: 201, pending: 202, conflict: 409 } as const;
    if (
      !parsed.success ||
      response.status !== expected[parsed.data.status] ||
      parsed.data.operationId !== operationId ||
      (parsed.data.status === 'created' && parsed.data.account.email !== email)
    ) {
      const code =
        body && typeof body === 'object' && 'code' in body
          ? String((body as { code: unknown }).code).slice(0, 64)
          : undefined;
      throw new Error(
        `Employee creation was not confirmed (HTTP ${response.status}${code ? `, ${code}` : ''}). Operation ${operationId}.`
      );
    }
    return parsed.data;
  }
}
