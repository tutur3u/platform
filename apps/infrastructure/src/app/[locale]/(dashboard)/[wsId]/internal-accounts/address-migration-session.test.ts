import { InternalApiError } from '@tuturuuu/internal-api/client';
import { describe, expect, it, vi } from 'vitest';
import {
  AddressMigrationSession,
  createMigrationTuple,
  type MigrationTuple,
} from './address-migration-session';

const tuple: MigrationTuple = {
  operationId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000002',
  sourceAddress: 'fixture@xwf.tuturuuu.com',
  destinationAddress: 'fixture@tuturuuu.com',
  expectedRevision: 0,
};
const ready = { status: 'ready', ...tuple };
const completed = {
  status: 'completed',
  operationId: tuple.operationId,
  userId: tuple.userId,
  email: tuple.destinationAddress,
};
function fixture() {
  const values = new Map<string, string>();
  const ports = {
    inspect: vi.fn().mockResolvedValue(ready),
    prepare: vi.fn().mockResolvedValue({
      prepared: true,
      userId: tuple.userId,
      destinationAddress: tuple.destinationAddress,
    }),
    migrate: vi.fn().mockResolvedValue(completed),
    assertActive: vi.fn(),
    changed: vi.fn(),
    storageKey: 'actor:workspace',
    storage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    },
  };
  const session = new AddressMigrationSession(ports);
  return { session, ports, values };
}
async function migrate(session: AddressMigrationSession) {
  await session.migrate(tuple.sourceAddress, tuple.destinationAddress);
}
describe('address migration operator session', () => {
  it('constructs only same-local legacy-first revision zero tuples', () => {
    const result = createMigrationTuple(tuple.userId, tuple.sourceAddress);
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toMatchObject({
        ...tuple,
        operationId: expect.any(String),
      });
    expect(
      createMigrationTuple(tuple.userId, 'fixture@tuturuuu.com').success
    ).toBe(false);
    expect(
      createMigrationTuple('not-a-uuid', tuple.sourceAddress).success
    ).toBe(false);
  });
  it('requires inspection and exact case-sensitive confirmation', async () => {
    const { session, ports } = fixture();
    await migrate(session);
    expect(ports.migrate).not.toHaveBeenCalled();
    await session.inspect(tuple);
    await session.migrate('FIXTURE@xwf.tuturuuu.com', tuple.destinationAddress);
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('performs fresh preflight and independently reconciles a completed write reply', async () => {
    const { session, ports } = fixture();
    await session.inspect(tuple);
    ports.inspect.mockResolvedValueOnce(ready).mockResolvedValueOnce(completed);
    await migrate(session);
    expect(ports.inspect).toHaveBeenCalledTimes(3);
    expect(ports.migrate).toHaveBeenCalledExactlyOnceWith(tuple);
    expect(ports.storage.setItem).toHaveBeenCalledWith(
      'actor:workspace',
      JSON.stringify({ version: 2, tuple, phase: 'migration_dispatched' })
    );
    expect(session.view.kind).toBe('completed');
    await migrate(session);
    expect(ports.migrate).toHaveBeenCalledTimes(1);
  });
  it('does not trust a completed write reply when independent reconciliation remains pending', async () => {
    const { session, ports } = fixture();
    await session.inspect(tuple);
    await migrate(session);
    expect(session.view.kind).toBe('pending');
    expect(ports.migrate).toHaveBeenCalledTimes(1);
  });
  it('retains an unknown outcome through remount and permits inspect only', async () => {
    const { session, ports } = fixture();
    await session.inspect(tuple);
    ports.migrate.mockRejectedValue(new Error('lost acknowledgement'));
    ports.inspect
      .mockResolvedValueOnce(ready)
      .mockRejectedValueOnce(new Error('offline'));
    await migrate(session);
    expect(session.view.kind).toBe('pending');
    const reopened = new AddressMigrationSession(ports);
    reopened.recover();
    expect(reopened.view).toEqual({ kind: 'pending', tuple });
    await migrate(reopened);
    ports.inspect.mockResolvedValue(completed);
    await reopened.inspect(tuple);
    expect(reopened.view.kind).toBe('completed');
    expect(ports.migrate).toHaveBeenCalledTimes(1);
  });
  it.each(['forbidden', 'conflict', 'not_ready'])(
    'fresh %s denies provider dispatch',
    async (code) => {
      const { session, ports } = fixture();
      await session.inspect(tuple);
      ports.inspect.mockResolvedValue({ status: 'denied', code });
      await migrate(session);
      expect(session.view.kind).toBe('denied');
      expect(ports.migrate).not.toHaveBeenCalled();
    }
  );
  it('rejects ready responses that change the original revision or target', async () => {
    const { session, ports } = fixture();
    ports.inspect.mockResolvedValue({ ...ready, expectedRevision: 1 });
    await session.inspect(tuple);
    expect(session.view).toEqual({ kind: 'pending', tuple });
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('blocks dispatch if its recovery receipt cannot be saved', async () => {
    const { session, ports } = fixture();
    await session.inspect(tuple);
    ports.storage.setItem.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    await migrate(session);
    expect(session.view.kind).toBe('denied');
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('does not dispatch or publish old preflight after actor/workspace retirement', async () => {
    const { session, ports } = fixture();
    await session.inspect(tuple);
    let resolve = (_value: unknown) => {};
    ports.inspect.mockImplementation(
      () =>
        new Promise((finish) => {
          resolve = finish;
        })
    );
    const pending = migrate(session);
    session.retire();
    session.activate();
    resolve(ready);
    await pending;
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('guards a changed live actor even before React unmount', async () => {
    const { session, ports } = fixture();
    await session.inspect(tuple);
    ports.assertActive.mockImplementation(() => {
      throw new Error('actor changed');
    });
    await expect(migrate(session)).rejects.toThrow('actor changed');
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('retains an operation found pending by the initial inspection without migration', async () => {
    const { session, ports } = fixture();
    ports.inspect.mockResolvedValue({
      status: 'pending',
      operationId: tuple.operationId,
      nextAction: 'inspect',
    });
    await session.inspect(tuple);
    expect(session.view).toEqual({ kind: 'pending', tuple });
    const reopened = new AddressMigrationSession(ports);
    reopened.recover();
    await migrate(reopened);
    expect(reopened.view).toEqual({ kind: 'pending', tuple });
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('retains the exact tuple after denial, remount and rejected replacement', async () => {
    const { session, ports, values } = fixture();
    ports.inspect.mockResolvedValue({ status: 'denied', code: 'not_ready' });
    await session.inspect(tuple);
    expect(session.view).toEqual({ kind: 'denied', tuple });
    expect(JSON.parse(values.get('actor:workspace') ?? '')).toEqual({
      version: 2,
      tuple,
      phase: 'unattempted',
    });
    const reopened = new AddressMigrationSession(ports);
    reopened.recover();
    expect(reopened.view).toEqual({ kind: 'frozen', tuple });
    await reopened.inspect({ ...tuple, operationId: tuple.userId });
    expect(ports.inspect).toHaveBeenCalledExactlyOnceWith(tuple);
    await reopened.inspect(tuple);
    expect(ports.inspect).toHaveBeenCalledTimes(2);
    expect(ports.inspect).toHaveBeenLastCalledWith(tuple);
    expect(ports.prepare).not.toHaveBeenCalled();
  });
  it('keeps an unknown first inspection frozen and inspect-only through remount', async () => {
    const { session, ports } = fixture();
    ports.inspect.mockRejectedValueOnce(new Error('offline'));
    await session.inspect(tuple);
    expect(session.view).toEqual({ kind: 'pending', tuple });
    const reopened = new AddressMigrationSession(ports);
    reopened.recover();
    expect(reopened.view).toEqual({ kind: 'pending', tuple });
    await reopened.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    expect(ports.prepare).not.toHaveBeenCalled();
    ports.inspect.mockResolvedValueOnce({
      status: 'denied',
      code: 'not_ready',
    });
    await reopened.inspect(tuple);
    expect(reopened.view).toEqual({ kind: 'denied', tuple });
    expect(reopened.canPrepare()).toBe(true);
  });
  it('constructs a recovered operation without generating another UUID', () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');
    expect(
      createMigrationTuple(tuple.userId, tuple.sourceAddress, tuple.operationId)
    ).toEqual({ success: true, data: tuple });
    expect(uuid).not.toHaveBeenCalled();
    uuid.mockRestore();
  });
  it('requires exact target and both confirmations for explicit preparation', async () => {
    const { session, ports } = fixture();
    await session.prepare(
      tuple,
      tuple.operationId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress.toUpperCase(),
      tuple.destinationAddress
    );
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.sourceAddress
    );
    expect(ports.prepare).not.toHaveBeenCalled();
    expect(ports.inspect).not.toHaveBeenCalled();
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    expect(ports.prepare).toHaveBeenCalledExactlyOnceWith(tuple);
    expect(session.view).toEqual({ kind: 'prepared', tuple });
    await migrate(session);
    expect(ports.migrate).not.toHaveBeenCalled();
    expect(ports.inspect).not.toHaveBeenCalled();
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    expect(ports.prepare).toHaveBeenCalledTimes(1);
    session.recover();
    expect(session.view).toEqual({ kind: 'prepared', tuple });
    await session.inspect(tuple);
    expect(session.view).toEqual({ kind: 'ready', tuple });
    ports.inspect.mockResolvedValueOnce(ready).mockResolvedValueOnce(completed);
    await migrate(session);
    expect(ports.inspect).toHaveBeenCalledTimes(3);
    expect(ports.migrate).toHaveBeenCalledExactlyOnceWith(tuple);
    expect(session.view).toEqual({ kind: 'completed', tuple });
  });
  it('recovers acknowledged preparation without treating it as migration readiness', async () => {
    const { session, ports } = fixture();
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    const reopened = new AddressMigrationSession(ports);
    reopened.recover();
    expect(reopened.view).toEqual({ kind: 'prepared', tuple });
    await migrate(reopened);
    expect(ports.migrate).not.toHaveBeenCalled();
    expect(ports.inspect).not.toHaveBeenCalled();
    await reopened.inspect(tuple);
    expect(reopened.view).toEqual({ kind: 'ready', tuple });
    expect(ports.inspect).toHaveBeenCalledExactlyOnceWith(tuple);
  });
  it('keeps unknown preparation inspect-only through reopen until positive readiness', async () => {
    const { session, ports } = fixture();
    ports.prepare.mockRejectedValue(new Error('lost preparation response'));
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    expect(session.view).toEqual({ kind: 'pending', tuple });
    const reopened = new AddressMigrationSession(ports);
    reopened.recover();
    expect(reopened.view).toEqual({ kind: 'pending', tuple });
    await reopened.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    await migrate(reopened);
    expect(ports.prepare).toHaveBeenCalledTimes(1);
    expect(ports.migrate).not.toHaveBeenCalled();
    ports.inspect.mockRejectedValueOnce(new Error('offline'));
    await reopened.inspect(tuple);
    expect(reopened.view).toEqual({ kind: 'pending', tuple });
    await reopened.inspect(tuple);
    expect(reopened.view).toEqual({ kind: 'ready', tuple });
    expect(ports.prepare).toHaveBeenCalledTimes(1);
    ports.inspect.mockResolvedValueOnce(ready).mockResolvedValueOnce(completed);
    await migrate(reopened);
    expect(ports.migrate).toHaveBeenCalledExactlyOnceWith(tuple);
    expect(reopened.canPrepare()).toBe(false);
    expect(reopened.view).toEqual({ kind: 'completed', tuple });
    expect(ports.prepare).toHaveBeenCalledTimes(1);
  });
  it.each([
    new InternalApiError('Forbidden', 403, 'forbidden'),
    new InternalApiError('Invalid', 400, 'invalid_input'),
    new InternalApiError('Not ready', 409, 'not_ready'),
    new InternalApiError('Conflict', 409, 'conflict'),
    { status: 'denied', code: 'forbidden' },
    { status: 'denied', code: 'invalid_input' },
    { status: 'denied', code: 'not_ready' },
    { status: 'denied', code: 'conflict' },
  ])(
    'never rearms lost preparation after denial and remount: %j',
    async (denial) => {
      const { session, ports, values } = fixture();
      ports.prepare.mockRejectedValueOnce(new Error('lost response'));
      await session.prepare(
        tuple,
        tuple.userId,
        tuple.sourceAddress,
        tuple.destinationAddress
      );
      if (denial instanceof Error) ports.inspect.mockRejectedValueOnce(denial);
      else ports.inspect.mockResolvedValueOnce(denial);
      await session.inspect(tuple);
      expect(session.view).toEqual({ kind: 'pending', tuple });
      expect(JSON.parse(values.get('actor:workspace') ?? '')).toEqual({
        version: 2,
        tuple,
        phase: 'prepare_unknown',
      });
      const reopened = new AddressMigrationSession(ports);
      reopened.recover();
      expect(reopened.view).toEqual({ kind: 'pending', tuple });
      await reopened.prepare(
        tuple,
        tuple.userId,
        tuple.sourceAddress,
        tuple.destinationAddress
      );
      await migrate(reopened);
      expect(ports.prepare).toHaveBeenCalledExactlyOnceWith(tuple);
      expect(ports.migrate).not.toHaveBeenCalled();
      await reopened.inspect(tuple);
      expect(reopened.view).toEqual({ kind: 'ready', tuple });
      expect(reopened.canPrepare()).toBe(false);
      ports.inspect.mockResolvedValueOnce({
        status: 'denied',
        code: 'not_ready',
      });
      await reopened.inspect(tuple);
      expect(reopened.view).toEqual({ kind: 'denied', tuple });
      reopened.recover();
      expect(reopened.view).toEqual({ kind: 'prepared', tuple });
      await reopened.prepare(
        tuple,
        tuple.userId,
        tuple.sourceAddress,
        tuple.destinationAddress
      );
      expect(ports.prepare).toHaveBeenCalledExactlyOnceWith(tuple);
    }
  );
  it.each([
    new InternalApiError('Forbidden', 403, 'forbidden'),
    new InternalApiError('Invalid', 400, 'invalid_input'),
    { status: 'denied', code: 'forbidden' },
    { status: 'denied', code: 'invalid_input' },
  ])(
    'does not clear unknown inspection on a pre-read denial: %j',
    async (denial) => {
      const { session, ports } = fixture();
      if (denial instanceof Error) ports.inspect.mockRejectedValueOnce(denial);
      else ports.inspect.mockResolvedValueOnce(denial);
      await session.inspect(tuple);
      expect(session.view).toEqual({ kind: 'pending', tuple });
      const reopened = new AddressMigrationSession(ports);
      reopened.recover();
      expect(reopened.view).toEqual({ kind: 'pending', tuple });
      await reopened.prepare(
        tuple,
        tuple.userId,
        tuple.sourceAddress,
        tuple.destinationAddress
      );
      expect(ports.prepare).not.toHaveBeenCalled();
      expect(reopened.canPrepare()).toBe(false);
    }
  );
  it.each(['not_ready', 'conflict'])(
    'permits explicit preparation after known 409 %s before any preparation',
    async (code) => {
      const { session, ports } = fixture();
      ports.inspect.mockRejectedValueOnce(
        new InternalApiError('Denied', 409, code)
      );
      await session.inspect(tuple);
      expect(session.view).toEqual({ kind: 'denied', tuple });
      expect(session.canPrepare()).toBe(true);
      await session.prepare(
        tuple,
        tuple.userId,
        tuple.sourceAddress,
        tuple.destinationAddress
      );
      expect(ports.prepare).toHaveBeenCalledExactlyOnceWith(tuple);
      expect(session.view).toEqual({ kind: 'prepared', tuple });
    }
  );
  it('never rearms unknown migration after positive denial or ready inspection', async () => {
    const { session, ports } = fixture();
    await session.inspect(tuple);
    ports.migrate.mockRejectedValue(new Error('unknown'));
    ports.inspect
      .mockResolvedValueOnce(ready)
      .mockRejectedValueOnce(new Error('offline'));
    await migrate(session);
    ports.inspect
      .mockResolvedValueOnce({ status: 'denied', code: 'not_ready' })
      .mockResolvedValueOnce(ready);
    await session.inspect(tuple);
    expect(session.view).toEqual({ kind: 'pending', tuple });
    await session.inspect(tuple);
    expect(session.view).toEqual({ kind: 'pending', tuple });
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    await migrate(session);
    expect(ports.migrate).toHaveBeenCalledTimes(1);
    expect(ports.prepare).not.toHaveBeenCalled();
  });
  it('keeps old bare recovery tuples inspect-only', async () => {
    const { ports, values } = fixture();
    values.set('actor:workspace', JSON.stringify(tuple));
    const reopened = new AddressMigrationSession(ports);
    reopened.recover();
    expect(reopened.view).toEqual({ kind: 'pending', tuple });
    await reopened.inspect(tuple);
    await reopened.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    await migrate(reopened);
    expect(reopened.view).toEqual({ kind: 'pending', tuple });
    expect(ports.prepare).not.toHaveBeenCalled();
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('does not prepare when durable recovery cannot be saved', async () => {
    const { session, ports } = fixture();
    ports.storage.setItem.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    expect(session.view).toEqual({ kind: 'denied', tuple });
    expect(ports.prepare).not.toHaveBeenCalled();
  });
  it('rejects mismatched preparation acknowledgement without rearming', async () => {
    const { session, ports } = fixture();
    ports.prepare.mockResolvedValue({
      prepared: true,
      userId: tuple.operationId,
      destinationAddress: tuple.destinationAddress,
    });
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    expect(session.view).toEqual({ kind: 'pending', tuple });
    expect(session.canPrepare()).toBe(false);
    expect(ports.inspect).not.toHaveBeenCalled();
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('guards the live actor before preparation', async () => {
    const { session, ports } = fixture();
    ports.assertActive.mockImplementation(() => {
      throw new Error('actor changed');
    });
    await expect(
      session.prepare(
        tuple,
        tuple.userId,
        tuple.sourceAddress,
        tuple.destinationAddress
      )
    ).rejects.toThrow('actor changed');
    expect(ports.prepare).not.toHaveBeenCalled();
  });
  it('does not publish preparation readiness after retirement', async () => {
    const { session, ports } = fixture();
    let finish = (_value: unknown) => {};
    ports.prepare.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    expect(session.view).toEqual({ kind: 'busy', tuple });
    await session.prepare(
      tuple,
      tuple.userId,
      tuple.sourceAddress,
      tuple.destinationAddress
    );
    session.retire();
    session.activate();
    finish({
      prepared: true,
      userId: tuple.userId,
      destinationAddress: tuple.destinationAddress,
    });
    await pending;
    expect(ports.prepare).toHaveBeenCalledTimes(1);
    const reopened = new AddressMigrationSession(ports);
    reopened.recover();
    expect(reopened.view).toEqual({ kind: 'pending', tuple });
  });
  it('keeps a new session editable when no recovery receipt exists', () => {
    const { session, ports, values } = fixture();
    session.recover();
    expect(values.size).toBe(0);
    expect(session.view).toEqual({ kind: 'editing' });
    expect(session.canPrepare()).toBe(true);
    expect(ports.storage.getItem).toHaveBeenCalledExactlyOnceWith(
      'actor:workspace'
    );
    expect(ports.storage.setItem).not.toHaveBeenCalled();
    expect(ports.inspect).not.toHaveBeenCalled();
    expect(ports.prepare).not.toHaveBeenCalled();
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('fails closed when recovery cannot be checked', async () => {
    const { session, ports } = fixture();
    ports.storage.getItem.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    session.recover();
    await session.inspect(tuple);
    await migrate(session);
    expect(ports.migrate).not.toHaveBeenCalled();
  });
  it('rejects malformed recovery evidence without constructing a new operation', () => {
    const { session, ports, values } = fixture();
    values.set(
      'actor:workspace',
      JSON.stringify({ ...tuple, expectedRevision: 2 })
    );
    session.recover();
    expect(session.view.kind).toBe('denied');
    expect(ports.inspect).not.toHaveBeenCalled();
    expect(ports.migrate).not.toHaveBeenCalled();
  });
});
