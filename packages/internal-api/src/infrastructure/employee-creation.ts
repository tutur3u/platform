import { z } from 'zod';
import { getInternalApiClient, type InternalApiClientOptions } from '../client';
import { parseInternalApiError } from '../internal-api-error';

export const EmployeeCreationOperationSchema = z.uuid();
// Supabase's required-symbol set is the printable ASCII punctuation ranges.
export const EmployeeCreationPasswordSchema = z
  .string()
  .min(12)
  .max(72)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/)
  .regex(/[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/);
export const EmployeeCreationPayloadSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(320)
      .endsWith('@tuturuuu.com'),
    displayName: z.string().trim().min(1).max(100),
    temporaryPassword: EmployeeCreationPasswordSchema,
  })
  .strict();
export const EmployeeCreationReplySchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('created'),
      operationId: z.uuid(),
      account: z
        .object({
          id: z.uuid(),
          email: z.email(),
          displayName: z.string().min(1).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      status: z.literal('pending'),
      operationId: z.uuid(),
      code: z.enum([
        'account_creation_outcome_unknown',
        'employee_provisioning_pending',
      ]),
      nextAction: z.literal('inspect'),
    })
    .strict(),
  z
    .object({
      status: z.literal('conflict'),
      operationId: z.uuid(),
      code: z.enum([
        'employee_account_conflict',
        'employee_operation_payload_conflict',
      ]),
      nextAction: z.literal('inspect'),
    })
    .strict(),
]);
export const EmployeeCreationAvailabilitySchema = z
  .object({
    available: z.boolean(),
  })
  .strict();
export type CreateInternalEmployeePayload = z.infer<
  typeof EmployeeCreationPayloadSchema
>;
export type CreateInternalEmployeeResponse = z.infer<
  typeof EmployeeCreationReplySchema
>;
export type EmployeeCreationOptions = InternalApiClientOptions & {
  operationId: string;
};
const endpoint = '/api/v1/infrastructure/internal-accounts/employees';

export async function getEmployeeCreationAvailability(
  options?: InternalApiClientOptions
) {
  const value = await getInternalApiClient(options).json<unknown>(endpoint, {
    cache: 'no-store',
  });
  return EmployeeCreationAvailabilitySchema.parse(value);
}

/** One request only. The server must supply a durable journal; this header is not one. */
export async function createInternalEmployee(
  payload: CreateInternalEmployeePayload,
  options: EmployeeCreationOptions
) {
  const operationId = EmployeeCreationOperationSchema.parse(
    options.operationId
  );
  const input = EmployeeCreationPayloadSchema.parse(payload);
  const response = await getInternalApiClient(options).fetch(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-tuturuuu-account-action': '1',
      'Idempotency-Key': operationId,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok && response.status !== 409)
    throw await parseInternalApiError(response);
  const value: unknown = await response.json();
  const result = EmployeeCreationReplySchema.parse(value);
  if (
    (response.status === 409 && result.status !== 'conflict') ||
    (result.status === 'conflict' && response.status !== 409) ||
    result.operationId !== operationId ||
    (result.status === 'created' &&
      (result.account.email !== input.email ||
        result.account.displayName !== input.displayName))
  ) {
    throw new Error('Employee creation outcome requires inspection');
  }
  return result;
}

export const EmployeeCreationObservationSchema = z.union([
  EmployeeCreationReplySchema,
  z
    .object({
      status: z.literal('stopped'),
      operationId: z.uuid(),
      code: z.enum(['employee_operation_revoked', 'employee_operation_halted']),
    })
    .strict(),
]);
export type EmployeeCreationObservation = z.infer<
  typeof EmployeeCreationObservationSchema
>;

/** Observation only; never resumes a provider or SQL mutation. */
export async function getInternalEmployeeCreationOperation(
  identity: { operationId: string; email: string; displayName: string },
  options?: InternalApiClientOptions & { signal?: AbortSignal }
) {
  const operationId = EmployeeCreationOperationSchema.parse(
    identity.operationId
  );
  const value = await getInternalApiClient(options).json<unknown>(
    `${endpoint}/operations/${operationId}`,
    { cache: 'no-store', signal: options?.signal }
  );
  const result = EmployeeCreationObservationSchema.parse(value);
  if (
    result.operationId !== operationId ||
    (result.status === 'created' &&
      (result.account.email !== identity.email ||
        result.account.displayName !== identity.displayName))
  ) {
    throw new Error('Employee operation identity mismatch');
  }
  return result;
}
