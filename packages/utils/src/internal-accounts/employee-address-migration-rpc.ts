import { z } from 'zod';
import {
  type AddressMigrationJournal,
  AddressMigrationRequest,
  MigrationBinding,
  MigrationInspection,
  sameMigrationBinding,
} from './employee-address-migration-contract';

async function json(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Migration response unavailable');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 131072) {
        await reader.cancel();
        throw new Error('Migration response too large');
      }
      body += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

/** One HTTP transaction per call; no retries and no write/read coalescing. */
export function createEmployeeAddressMigrationJournal(input: {
  url: string;
  key: string;
  request: AddressMigrationRequest;
  authorize(actorId: string): Promise<boolean>;
  fetch?: typeof fetch;
}): AddressMigrationJournal {
  const request = AddressMigrationRequest.parse(input.request);
  const origin = new URL(input.url);
  if (
    (origin.protocol !== 'https:' &&
      !(
        origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(origin.hostname)
      )) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/' ||
    !input.key
  )
    throw new Error('Migration transport unavailable');
  const fetcher = input.fetch ?? globalThis.fetch;
  function bound(value: unknown, binding: boolean) {
    const parsed = binding
      ? MigrationBinding.parse(value)
      : AddressMigrationRequest.parse(
          z.object(AddressMigrationRequest.shape).parse(value)
        );
    for (const key of Object.keys(request)) {
      if (Reflect.get(parsed, key) !== Reflect.get(request, key))
        throw new Error('Migration tuple changed');
    }
    return parsed;
  }
  async function call(
    action: 'inspect' | 'reserve' | 'claim' | 'complete',
    value: unknown,
    attemptId?: string
  ) {
    const parsed = bound(value, action !== 'inspect');
    if (!(await input.authorize(request.actorId)))
      throw new Error('Migration forbidden');
    const response = await fetcher(
      new URL('/rest/v1/rpc/employee_address_migration', origin),
      {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          apikey: input.key,
          Authorization: `Bearer ${input.key}`,
          'Content-Type': 'application/json',
          'Content-Profile': 'private',
          'Accept-Profile': 'private',
          Prefer: 'tx=commit',
        },
        body: JSON.stringify({
          p_action: action,
          p_request: parsed,
          p_attempt_id: attemptId ?? null,
        }),
      }
    );
    if (
      !response.ok ||
      response.headers.get('preference-applied')?.includes('tx=rollback')
    )
      throw new Error('Migration acknowledgement unavailable');
    return json(response);
  }
  return {
    async inspect(value) {
      const observed = MigrationInspection.parse(await call('inspect', value));
      if (
        observed.record &&
        !sameMigrationBinding(observed.record.binding, {
          ...request,
          immutableFingerprint: observed.record.binding.immutableFingerprint,
          providerIdentityFingerprint:
            observed.record.binding.providerIdentityFingerprint,
        })
      )
        throw new Error('Migration receipt changed');
      return observed;
    },
    reserve: (value) => call('reserve', value),
    claimAttempt: (value, attemptId) =>
      call(
        'claim',
        value,
        AddressMigrationRequest.shape.operationId.parse(attemptId)
      ),
    complete: (value) => call('complete', value),
  };
}
