import { createServerFn } from '@tanstack/react-start';
import type { PasswordsErrorCode, PasswordsResult } from './port';
import {
  auditInput,
  createVaultInput,
  observeOperationInput,
  ownerCredentialInput,
  putItemInput,
  revealItemInput,
  rotateVaultInput,
  sanitizedValidator,
  setMemberInput,
  stateInput,
} from './schemas';

/** Server bodies import the request context lazily so no server module reaches the client. */
async function service() {
  return (await import('./request-context.server')).passwordsService();
}

/**
 * An exception is never forwarded: its message could carry secret-adjacent
 * detail. After a write was attempted, the outcome is unknown and the caller
 * must observe the original receipt before any further write.
 */
async function guarded<T>(
  failure: Extract<PasswordsErrorCode, 'UNAVAILABLE' | 'OPERATION_UNCERTAIN'>,
  work: () => Promise<PasswordsResult<T>>
): Promise<PasswordsResult<T>> {
  try {
    return await work();
  } catch {
    return { ok: false, code: failure };
  }
}

export const detectLocale = createServerFn({ method: 'GET' }).handler(
  async () => (await import('./request-context.server')).requestLocale()
);

export const loadState = createServerFn({ method: 'GET' })
  .validator(sanitizedValidator(stateInput))
  .handler(({ data }) =>
    guarded('UNAVAILABLE', async () => (await service()).state(data))
  );

export const loadAudit = createServerFn({ method: 'GET' })
  .validator(sanitizedValidator(auditInput))
  .handler(({ data }) =>
    guarded('UNAVAILABLE', async () => (await service()).audit(data))
  );

export const createVault = createServerFn({ method: 'POST' })
  .validator(sanitizedValidator(createVaultInput))
  .handler(({ data }) =>
    guarded('OPERATION_UNCERTAIN', async () =>
      (await service()).createVault(data)
    )
  );

export const putItem = createServerFn({ method: 'POST' })
  .validator(sanitizedValidator(putItemInput))
  .handler(({ data }) =>
    guarded('OPERATION_UNCERTAIN', async () => (await service()).putItem(data))
  );

/** POST so the response is never cached and no identifier lands in a URL. */
export const revealItem = createServerFn({ method: 'POST' })
  .validator(sanitizedValidator(revealItemInput))
  .handler(({ data }) =>
    guarded('OPERATION_UNCERTAIN', async () =>
      (await service()).revealItem(data)
    )
  );

export const setMember = createServerFn({ method: 'POST' })
  .validator(sanitizedValidator(setMemberInput))
  .handler(({ data }) =>
    guarded('OPERATION_UNCERTAIN', async () =>
      (await service()).setMember(data)
    )
  );

export const rotateVault = createServerFn({ method: 'POST' })
  .validator(sanitizedValidator(rotateVaultInput))
  .handler(({ data }) =>
    guarded('OPERATION_UNCERTAIN', async () =>
      (await service()).rotateVault(data)
    )
  );

export const observeOperation = createServerFn({ method: 'POST' })
  .validator(sanitizedValidator(observeOperationInput))
  .handler(({ data }) =>
    guarded('UNAVAILABLE', async () => (await service()).observeOperation(data))
  );

export const downloadCredentials = createServerFn({ method: 'POST' })
  .validator(sanitizedValidator(ownerCredentialInput))
  .handler(({ data }) =>
    guarded('OPERATION_UNCERTAIN', async () =>
      (await service()).downloadCredentials(data)
    )
  );
