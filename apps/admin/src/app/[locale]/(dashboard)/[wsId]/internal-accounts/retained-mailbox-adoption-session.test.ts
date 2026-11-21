// @vitest-environment node
import type { inspectRetainedMailboxAdoption } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it, vi } from 'vitest';
import {
  type AdoptionView,
  RetainedMailboxAdoptionSession,
} from './retained-mailbox-adoption-session';

const tuple = {
  operationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  sourceAddress: 'retained@xwf.tuturuuu.com',
  destinationAddress: 'retained@tuturuuu.com',
  expectedRevision: 0 as const,
};
const eligible = {
  status: 'eligible' as const,
  ...tuple,
  snapshot: 'a'.repeat(64),
};
function setup(saved: string | null = null) {
  let view: AdoptionView = { kind: 'idle' };
  const storage = {
    getItem: vi.fn(() => saved),
    setItem: vi.fn((_key: string, value: string) => {
      saved = value;
    }),
  };
  const inspect = vi.fn<typeof inspectRetainedMailboxAdoption>(
    async () => eligible
  );
  const adopt = vi.fn(async () => ({
    ...eligible,
    status: 'adopted' as const,
  }));
  const adopted = vi.fn(async () => {});
  const assertActive = vi.fn();
  const session = new RetainedMailboxAdoptionSession({
    tuple,
    storage,
    storageKey: 'owned-test',
    inspect,
    adopt,
    adopted,
    assertActive,
    changed: (value) => {
      view = value;
    },
  });
  return {
    session,
    storage,
    inspect,
    adopt,
    adopted,
    assertActive,
    view: () => view,
  };
}
const confirmation = {
  userId: tuple.userId,
  source: tuple.sourceAddress,
  destination: tuple.destinationAddress,
  ownershipConfirmed: true,
};
describe('retained adoption original-operation recovery', () => {
  it('requires explicit exact target, both addresses and ownership confirmation', async () => {
    for (const changed of [
      { userId: 'other' },
      { source: 'wrong@xwf.tuturuuu.com' },
      { destination: 'wrong@tuturuuu.com' },
      { ownershipConfirmed: false },
    ]) {
      const p = setup();
      await p.session.inspect();
      await p.session.adopt(eligible, { ...confirmation, ...changed });
      expect(p.adopt).not.toHaveBeenCalled();
    }
  });
  it('sends no mutation when the pre-dispatch receipt cannot persist', async () => {
    const p = setup();
    p.storage.setItem.mockImplementation(() => {
      throw new Error('full');
    });
    await p.session.adopt(eligible, confirmation);
    expect(p.adopt).not.toHaveBeenCalled();
    expect(p.view().kind).toBe('denied');
  });
  it('recovers acknowledgement loss with the original operation and no replay', async () => {
    const p = setup();
    p.adopt.mockRejectedValueOnce(new Error('lost ack'));
    p.inspect.mockResolvedValue({ ...eligible, status: 'adopted' });
    await p.session.adopt(eligible, confirmation);
    expect(p.view().kind).toBe('adopted');
    expect(p.adopt).toHaveBeenCalledTimes(1);
    expect(p.inspect).toHaveBeenCalledWith(tuple);
    expect(p.adopted).toHaveBeenCalledTimes(1);
    await p.session.adopt(eligible, confirmation);
    expect(p.adopt).toHaveBeenCalledTimes(1);
  });
  it('retains the unknown fence after an absent receipt and across remount', async () => {
    const p = setup();
    p.adopt.mockRejectedValueOnce(new Error('unknown'));
    await p.session.adopt(eligible, confirmation);
    expect(p.view().kind).toBe('unknown');
    const recovered = setup(p.storage.setItem.mock.calls[0]?.[1]);
    await recovered.session.inspect();
    await recovered.session.adopt(eligible, confirmation);
    expect(recovered.view().kind).toBe('unknown');
    expect(recovered.adopt).not.toHaveBeenCalled();
  });
  it('rejects receipt drift and operation replacement', async () => {
    const p = setup(
      JSON.stringify({
        operationId: tuple.operationId,
        phase: 'unknown',
        snapshot: 'b'.repeat(64),
      })
    );
    await p.session.inspect();
    expect(p.view().kind).toBe('unknown');
    expect(p.adopted).not.toHaveBeenCalled();
    const replaced = setup(
      JSON.stringify({
        operationId: '00000000-0000-4000-8000-000000000003',
        phase: 'unknown',
        snapshot: eligible.snapshot,
      })
    );
    await replaced.session.inspect();
    expect(replaced.inspect).not.toHaveBeenCalled();
  });
  it('fences a retired actor before mutation and after delayed readback', async () => {
    const p = setup();
    p.session.retire();
    await expect(p.session.adopt(eligible, confirmation)).rejects.toThrow(
      'Retired'
    );
    expect(p.adopt).not.toHaveBeenCalled();
    const q = setup();
    let release: (() => void) | undefined;
    q.inspect.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ...eligible, status: 'adopted' };
    });
    const pending = q.session.inspect();
    q.session.retire();
    release?.();
    await pending;
    expect(q.adopted).not.toHaveBeenCalled();
  });
});

it('does not publish or issue adoption after permission revocation during inspection', async () => {
  const p = setup();
  p.inspect.mockImplementation(async () => {
    p.assertActive.mockImplementation(() => {
      throw new Error('revoked');
    });
    return eligible;
  });
  await expect(p.session.inspect()).resolves.toBeUndefined();
  expect(p.view().kind).toBe('busy');
  expect(p.adopt).not.toHaveBeenCalled();
});
