import { describe, expect, it, vi } from 'vitest';
import {
  AddressMigrationSession,
  createMigrationTuple,
  type MigrationTuple,
} from './address-migration-session';

const tuple: MigrationTuple = {
  operationId: '53581515-5358-4358-8358-535815155358',
  userId: '53581515-5358-4358-8358-535815155359',
  sourceAddress: 'khoi@xwf.tuturuuu.com',
  destinationAddress: 'khoi@tuturuuu.com',
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
      createMigrationTuple(tuple.userId, 'khoi@tuturuuu.com').success
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
    await session.migrate('KHOI@xwf.tuturuuu.com', tuple.destinationAddress);
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
      JSON.stringify(tuple)
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
    expect(session.view.kind).toBe('denied');
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
