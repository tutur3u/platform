import { describe, expect, it, vi } from 'vitest';
import { persistDocumentMove } from './persist-move';
const result = {
  kind: 'allowed',
  move: { parent_id: 'parent', position: 5 },
  preparation: [{ id: 'sibling', position: 0 }],
} as const;
describe('persist document moves', () => {
  it('writes preparation before the document move', async () => {
    const update = vi.fn().mockResolvedValue({});
    expect(
      await persistDocumentMove({
        id: 'page',
        result: { ...result, preparation: [...result.preparation] },
        canManage: true,
        update,
      })
    ).toBe('saved');
    expect(update.mock.calls).toEqual([
      ['sibling', { position: 0 }],
      ['page', { parent_id: 'parent', position: 5 }],
    ]);
  });
  it('stops after unknown preparation and never replays the write', async () => {
    const update = vi.fn().mockRejectedValue(new Error('Connection lost'));
    expect(
      await persistDocumentMove({
        id: 'page',
        result: { ...result, preparation: [...result.preparation] },
        canManage: true,
        update,
      })
    ).toBe('unknown');
    expect(update.mock.calls).toEqual([['sibling', { position: 0 }]]);
  });
  it('does not write without management permission', async () => {
    const update = vi.fn();
    expect(
      await persistDocumentMove({
        id: 'page',
        result: { ...result, preparation: [...result.preparation] },
        canManage: false,
        update,
      })
    ).toBe('denied');
    expect(update).not.toHaveBeenCalled();
  });
  it('does not replay an unconfirmed final move', async () => {
    const update = vi.fn().mockRejectedValue(new Error('Connection lost'));
    expect(
      await persistDocumentMove({
        id: 'page',
        result: { kind: 'allowed', move: result.move },
        canManage: true,
        update,
      })
    ).toBe('unknown');
    expect(update).toHaveBeenCalledTimes(1);
  });
});
