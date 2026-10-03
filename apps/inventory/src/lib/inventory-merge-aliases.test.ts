import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { getMergedWarehouseIds } from './inventory-merge-aliases';

function client(result: {
  data: Array<{ source_id: string }> | null;
  error: null | { code: string };
}) {
  const second = vi.fn().mockResolvedValue(result);
  const first = vi.fn(() => ({ eq: second }));
  const select = vi.fn(() => ({ eq: first }));
  const from = vi.fn(() => ({ select }));
  const schema = vi.fn(() => ({ from }));
  return {
    admin: { schema } as unknown as TypedSupabaseClient,
    schema,
    from,
    first,
    second,
  };
}
describe('Warehouse merge aliases', () => {
  it('scopes aliases to workspace and warehouse kind', async () => {
    const fixture = client({
      data: [{ source_id: '00009000-0000-4000-8000-000000000030' }],
      error: null,
    });
    expect(await getMergedWarehouseIds(fixture.admin, 'workspace')).toEqual({
      ids: ['00009000-0000-4000-8000-000000000030'],
      error: null,
    });
    expect(fixture.schema).toHaveBeenCalledWith('private');
    expect(fixture.first).toHaveBeenCalledWith('ws_id', 'workspace');
    expect(fixture.second).toHaveBeenCalledWith('kind', 'warehouse');
  });
  it.each(['42P01', 'PGRST205'])(
    'preserves ordinary warehouse lists before merge migrations (%s)',
    async (code) => {
      expect(
        await getMergedWarehouseIds(
          client({ data: null, error: { code } }).admin,
          'workspace'
        )
      ).toEqual({ ids: [], error: null });
    }
  );
  it('does not hide a genuine alias lookup failure', async () => {
    expect(
      await getMergedWarehouseIds(
        client({ data: null, error: { code: 'XX000' } }).admin,
        'workspace'
      )
    ).toEqual({ ids: [], error: { code: 'XX000' } });
  });
});
