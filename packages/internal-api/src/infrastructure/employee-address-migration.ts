import { z } from 'zod';
import { getInternalApiClient, type InternalApiClientOptions } from '../client';

const Uuid = z.uuid();
const Tuple = z.strictObject({
  operationId: Uuid,
  userId: Uuid,
  sourceAddress: z.email(),
  destinationAddress: z.email(),
  expectedRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
});
export type InternalEmployeeAddressMigrationPayload = z.infer<typeof Tuple>;

const Outcome = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ready'),
    ...Tuple.shape,
  }),
  z.strictObject({
    status: z.literal('pending'),
    operationId: Uuid,
    nextAction: z.literal('inspect'),
  }),
  z.strictObject({
    status: z.literal('completed'),
    operationId: Uuid,
    userId: Uuid,
    email: z.email(),
  }),
  z.strictObject({
    status: z.literal('denied'),
    code: z.enum(['invalid_input', 'forbidden', 'conflict', 'not_ready']),
  }),
]);
export type InternalEmployeeAddressMigrationResponse = z.infer<typeof Outcome>;

async function call(
  action: 'inspect' | 'migrate',
  payload: InternalEmployeeAddressMigrationPayload,
  options?: InternalApiClientOptions
) {
  const tuple = Tuple.parse(payload);
  const response = await getInternalApiClient(options).json<unknown>(
    `/api/v1/infrastructure/internal-accounts/address-migrations/${action}`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-tuturuuu-account-action': '1',
      },
      body: JSON.stringify(tuple),
    }
  );
  const outcome = Outcome.parse(response);
  if (
    ('operationId' in outcome && outcome.operationId !== tuple.operationId) ||
    ('userId' in outcome && outcome.userId !== tuple.userId) ||
    (outcome.status === 'completed' &&
      outcome.email !== tuple.destinationAddress) ||
    (outcome.status === 'ready' &&
      (action !== 'inspect' ||
        outcome.sourceAddress !== tuple.sourceAddress ||
        outcome.destinationAddress !== tuple.destinationAddress ||
        outcome.expectedRevision !== tuple.expectedRevision))
  )
    throw new Error(
      'Address migration receipt does not match the original operation'
    );
  return outcome;
}

export function inspectInternalEmployeeAddressMigration(
  payload: InternalEmployeeAddressMigrationPayload,
  options?: InternalApiClientOptions
) {
  return call('inspect', payload, options);
}

export function migrateInternalEmployeeAddress(
  payload: InternalEmployeeAddressMigrationPayload,
  options?: InternalApiClientOptions
) {
  return call('migrate', payload, options);
}

const Preparation = z.strictObject({
  prepared: z.literal(true),
  userId: Uuid,
  destinationAddress: z.email(),
});

export async function prepareInternalEmployeeAddressMigration(
  payload: InternalEmployeeAddressMigrationPayload,
  options?: InternalApiClientOptions
) {
  const tuple = Tuple.parse(payload);
  const response = await getInternalApiClient(options).json<unknown>(
    '/api/v1/infrastructure/internal-accounts/address-migrations/prepare',
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-tuturuuu-account-action': '1',
      },
      body: JSON.stringify(tuple),
    }
  );
  const receipt = Preparation.parse(response);
  if (
    receipt.userId !== tuple.userId ||
    receipt.destinationAddress !== tuple.destinationAddress
  )
    throw new Error('Mailbox preparation receipt does not match the target');
  return receipt;
}
