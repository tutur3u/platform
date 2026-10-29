// @vitest-environment node
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultFormStudioInput } from '../schema';
import { saveFormDefinition } from './mutations';

const state = vi.hoisted(() => ({
  existing: { ws_id: 'foreign', creator_id: 'original' } as {
    ws_id: string;
    creator_id: string;
  } | null,
  lookupError: null as { message: string } | null,
  writes: [] as { table: string; payload: unknown }[],
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('./client', () => ({
  getPrivateFormsClient: () => ({
    from: (table: string) => {
      const query = Object.assign(Promise.resolve({ error: null }), {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: state.existing,
          error: state.lookupError,
        }),
        upsert: async (payload: unknown) => {
          state.writes.push({ table, payload });
          return { error: null };
        },
        delete: () => query,
        insert: async () => ({ error: null }),
      });
      return query;
    },
  }),
}));
beforeEach(() => {
  state.existing = { ws_id: 'foreign', creator_id: 'original' };
  state.lookupError = null;
  state.writes = [];
});
async function save(formId?: string) {
  return saveFormDefinition({
    supabase: await createAdminClient(),
    wsId: 'workspace',
    creatorId: 'actor',
    formId,
    input: createDefaultFormStudioInput(),
  });
}
it('rejects a form owned by another workspace before any mutation', async () => {
  await expect(save('form')).rejects.toThrow('Form not found');
  expect(state.writes).toEqual([]);
});
it('rejects an unknown supplied form ID', async () => {
  state.existing = null;
  await expect(save('form')).rejects.toThrow('Form not found');
  expect(state.writes).toEqual([]);
});
it('does not treat a failed lookup as a new form', async () => {
  state.existing = null;
  state.lookupError = { message: 'lookup failed' };
  await expect(save('form')).rejects.toThrow('lookup failed');
  expect(state.writes).toEqual([]);
});
it('keeps same-workspace updates and the original creator', async () => {
  state.existing = { ws_id: 'workspace', creator_id: 'original' };
  expect(await save('form')).toBe('form');
  expect(state.writes[0]?.payload).toMatchObject({
    ws_id: 'workspace',
    creator_id: 'original',
  });
});
it('keeps generated-ID creation', async () => {
  state.existing = null;
  expect(await save()).toBeTruthy();
});

it.each(['foreign/forms/file.png', 'workspace/forms/%2e%2e/private.png'])(
  'drops out-of-scope media %s before persisting a definition',
  async (path) => {
    state.existing = { ws_id: 'workspace', creator_id: 'original' };
    const input = createDefaultFormStudioInput();
    input.theme.coverImage = {
      storagePath: path,
      url: 'https://example.test/stale',
      alt: '',
    };
    await saveFormDefinition({
      supabase: await createAdminClient(),
      wsId: 'workspace',
      creatorId: 'actor',
      formId: 'form',
      input,
    });
    expect(state.writes[0]?.payload).toMatchObject({
      theme: { coverImage: { storagePath: '', url: '' } },
    });
  }
);
