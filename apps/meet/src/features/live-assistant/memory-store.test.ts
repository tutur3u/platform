import { afterEach, expect, it, vi } from 'vitest';
import { applyMemoryCommand } from '../../../cloudflare/live/memory-store';
import type { LiveEnvironment } from '../../../cloudflare/live/storage';

afterEach(() => vi.unstubAllGlobals());
it('requests a representation so a successful preferences upsert has a parseable response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const representation = init.headers.Prefer.includes(
        'return=representation'
      );
      return new Response(representation ? '[{"memory_enabled":true}]' : null, {
        status: 201,
      });
    })
  );
  await expect(
    applyMemoryCommand(
      {
        NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid',
        SUPABASE_SECRET_KEY: 'fixture',
      } as LiveEnvironment,
      'owner',
      { action: 'settings', enabled: true }
    )
  ).resolves.toEqual({ ok: true });
});
