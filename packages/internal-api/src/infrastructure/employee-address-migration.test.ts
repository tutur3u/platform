import { describe, expect, it, vi } from 'vitest';
import {
  adoptRetainedMailbox,
  inspectInternalEmployeeAddressMigration,
  inspectRetainedMailboxAdoption,
  migrateInternalEmployeeAddress,
  prepareInternalEmployeeAddressMigration,
} from './employee-address-migration';

const payload = {
  operationId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000002',
  sourceAddress: 'person@xwf.tuturuuu.com',
  destinationAddress: 'person@tuturuuu.com',
  expectedRevision: 0,
};
const pending = {
  status: 'pending',
  operationId: payload.operationId,
  nextAction: 'inspect',
};
function setup(value: unknown, status = 200) {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(value, { status })
  );
  return {
    fetcher,
    options: { baseUrl: 'https://infra.test', fetch: fetcher },
  };
}

describe('address migration typed consumer', () => {
  it.each([
    ['inspect', inspectInternalEmployeeAddressMigration],
    ['migrate', migrateInternalEmployeeAddress],
  ] as const)(
    'sends one private %s request with the original tuple and action header',
    async (action, call) => {
      const f = setup(pending, 202);
      expect(await call(payload, f.options)).toEqual(pending);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = f.fetcher.mock.calls[0]!;
      expect(url).toBe(
        `https://infra.test/api/v1/infrastructure/internal-accounts/address-migrations/${action}`
      );
      expect(init?.method).toBe('POST');
      expect(init?.cache).toBe('no-store');
      expect(new Headers(init?.headers).get('x-tuturuuu-account-action')).toBe(
        '1'
      );
      expect(JSON.parse(String(init?.body))).toEqual(payload);
    }
  );
  it('prepares only the exact target through one explicit action POST', async () => {
    const receipt = {
      prepared: true,
      userId: payload.userId,
      destinationAddress: payload.destinationAddress,
    };
    const f = setup(receipt);
    expect(
      await prepareInternalEmployeeAddressMigration(payload, f.options)
    ).toEqual(receipt);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const call = f.fetcher.mock.calls[0];
    if (!call) throw new Error('Missing preparation request');
    expect(call[0]).toBe(
      'https://infra.test/api/v1/infrastructure/internal-accounts/address-migrations/prepare'
    );
    expect(call[1]?.method).toBe('POST');
    expect(call[1]?.cache).toBe('no-store');
    expect(new Headers(call[1]?.headers).get('Content-Type')).toBe(
      'application/json'
    );
    expect(new Headers(call[1]?.headers).get('x-tuturuuu-account-action')).toBe(
      '1'
    );
    expect(JSON.parse(String(call[1]?.body))).toEqual(payload);
  });
  it.each([
    {
      prepared: true,
      userId: payload.operationId,
      destinationAddress: payload.destinationAddress,
    },
    {
      prepared: true,
      userId: payload.userId,
      destinationAddress: payload.sourceAddress,
    },
    {
      prepared: false,
      userId: payload.userId,
      destinationAddress: payload.destinationAddress,
    },
    {
      prepared: true,
      userId: payload.userId,
      destinationAddress: payload.destinationAddress,
      actorId: payload.userId,
    },
    { status: 'ready', ...payload },
    {
      status: 'completed',
      operationId: payload.operationId,
      userId: payload.userId,
      email: payload.destinationAddress,
    },
  ])(
    'refuses malformed or mismatched preparation acknowledgement %j',
    async (receipt) => {
      const f = setup(receipt);
      await expect(
        prepareInternalEmployeeAddressMigration(payload, f.options)
      ).rejects.toThrow();
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    }
  );
  it.each([403, 409, 503])(
    'does not replay a preparation HTTP %s failure',
    async (status) => {
      const f = setup({ code: 'unavailable' }, status);
      await expect(
        prepareInternalEmployeeAddressMigration(payload, f.options)
      ).rejects.toMatchObject({ status });
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    }
  );
  it('does not replay a lost preparation response or accept a client actor', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Lost preparation response');
    });
    const options = { baseUrl: 'https://infra.test', fetch: fetcher };
    await expect(
      prepareInternalEmployeeAddressMigration(payload, options)
    ).rejects.toThrow('Lost preparation response');
    await expect(
      prepareInternalEmployeeAddressMigration(
        { ...payload, actorId: payload.userId },
        options
      )
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns readiness only for the exact inspected tuple', async () => {
    const f = setup({ status: 'ready', ...payload });
    expect(
      await inspectInternalEmployeeAddressMigration(payload, f.options)
    ).toEqual({ status: 'ready', ...payload });
    await expect(
      migrateInternalEmployeeAddress(payload, f.options)
    ).rejects.toThrow('receipt');
  });
  it.each([
    { ...pending, operationId: payload.userId },
    { status: 'ready', ...payload, expectedRevision: 1 },
    { status: 'ready', ...payload, sourceAddress: 'other@xwf.tuturuuu.com' },
    {
      status: 'completed',
      operationId: payload.operationId,
      userId: payload.operationId,
      email: payload.destinationAddress,
    },
    {
      status: 'completed',
      operationId: payload.operationId,
      userId: payload.userId,
      email: payload.sourceAddress,
    },
    { status: 'completed' },
    { ...pending, actorId: payload.userId },
  ])('refuses malformed or mismatched receipt %j', async (value) => {
    const f = setup(value);
    await expect(
      inspectInternalEmployeeAddressMigration(payload, f.options)
    ).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not retry a lost acknowledgement', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Lost response');
    });
    await expect(
      migrateInternalEmployeeAddress(payload, {
        baseUrl: 'https://infra.test',
        fetch: fetcher,
      })
    ).rejects.toThrow('Lost response');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([403, 409, 503])(
    'preserves HTTP %s as an error without retry',
    async (status) => {
      const f = setup({ code: 'not_ready' }, status);
      await expect(
        migrateInternalEmployeeAddress(payload, f.options)
      ).rejects.toMatchObject({ status });
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    }
  );
  it('rejects injected actor identity before transport', async () => {
    const f = setup(pending);
    await expect(
      migrateInternalEmployeeAddress(
        { ...payload, actorId: payload.userId },
        f.options
      )
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});

describe('retained adoption consumer', () => {
  const receipt = {
    status: 'adopted',
    operationId: payload.operationId,
    userId: payload.userId,
    destinationAddress: payload.destinationAddress,
    expectedRevision: 0,
    snapshot: 'a'.repeat(64),
  };
  it('requires explicit confirmation and binds the original operation and snapshot', async () => {
    const p = setup(receipt);
    expect(
      await adoptRetainedMailbox(
        payload,
        { snapshot: receipt.snapshot, ownershipConfirmed: true },
        p.options
      )
    ).toEqual(receipt);
    expect(JSON.parse(String(p.fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      ...payload,
      snapshot: receipt.snapshot,
      ownershipConfirmed: true,
    });
    expect(String(p.fetcher.mock.calls[0]?.[0])).toContain('/adopt-retained');
    const q = setup({ ...receipt, snapshot: 'b'.repeat(64) });
    await expect(
      adoptRetainedMailbox(
        payload,
        { snapshot: receipt.snapshot, ownershipConfirmed: true },
        q.options
      )
    ).rejects.toThrow();
  });
  it('uses readback on the original tuple and rejects a rebound receipt', async () => {
    const p = setup(receipt);
    expect(await inspectRetainedMailboxAdoption(payload, p.options)).toEqual(
      receipt
    );
    expect(String(p.fetcher.mock.calls[0]?.[0])).toContain('/retained-inspect');
    const q = setup({ ...receipt, userId: payload.operationId });
    await expect(
      inspectRetainedMailboxAdoption(payload, q.options)
    ).rejects.toThrow();
  });
});
