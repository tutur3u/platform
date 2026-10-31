// @vitest-environment node
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultFormStudioInput } from '../schema';
import type { FormDefinition } from '../types';
import { resolveFormDefinitionMedia } from './media';

const state = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    storage: { from: () => ({ createSignedUrl: state.sign }) },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.sign.mockResolvedValue({
    data: { signedUrl: 'https://example.test/signed' },
    error: null,
  });
});
function definition(storagePath: string): FormDefinition {
  const input = createDefaultFormStudioInput();
  return {
    ...input,
    id: 'form',
    wsId: 'workspace',
    creatorId: 'actor',
    createdAt: '',
    updatedAt: '',
    logicRules: [],
    sections: [],
    theme: {
      ...input.theme,
      coverImage: { storagePath, url: 'https://example.test/stale', alt: '' },
    },
  };
}
it.each([
  'foreign/forms/file.png',
  'workspace/private.png',
  'workspace/forms/%2e%2e/private.png',
  'workspace/forms/%252e%252e/private.png',
])('does not sign stored out-of-scope media %s', async (path) => {
  const result = await resolveFormDefinitionMedia(
    await createAdminClient(),
    definition(path)
  );
  expect(state.sign).not.toHaveBeenCalled();
  expect(result.theme.coverImage.storagePath).toBe('');
  expect(result.theme.coverImage.url).toBe('');
});
it('signs encoded media in the form workspace', async () => {
  const result = await resolveFormDefinitionMedia(
    await createAdminClient(),
    definition('workspace/forms/café photo.png')
  );
  expect(state.sign).toHaveBeenCalledWith(
    'workspace/forms/caf%C3%A9%20photo.png',
    3600
  );
  expect(result.theme.coverImage.url).toBe('https://example.test/signed');
});
