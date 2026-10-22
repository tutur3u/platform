import { describe, expect, it, vi } from 'vitest';

const pinned = vi.hoisted(() => {
  const methods: string[] = [];
  return { methods };
});
vi.mock('@tanstack/react-start', () => ({
  createServerFn: ({ method }: { method: string }) => {
    pinned.methods.push(method);
    return {
      validator: (schema: { parse(input: unknown): unknown }) => ({
        handler:
          (_handler: unknown) =>
          async ({ data }: { data: unknown }) =>
            schema.parse(data),
      }),
    };
  },
}));

import { loadMailPage } from './page-loader';
import { addRealtimeLog } from './realtime-actions';

describe('pinned Start validator boundaries', () => {
  it('initializes real boundary modules against a validator-only builder', () => {
    expect(pinned.methods).toEqual(['GET', 'POST']);
  });
  it('preserves page URL validation before a supplier can execute', async () => {
    expect(
      await loadMailPage({ data: { path: '/vi/personal/inbox' } })
    ).toEqual({ path: '/vi/personal/inbox' });
    for (const path of [
      '//foreign.example/inbox',
      'https://foreign.example',
      'x'.repeat(8193),
    ])
      await expect(loadMailPage({ data: { path } })).rejects.toThrow();
  });
  it('preserves the realtime tuple boundary and denies malformed identity', async () => {
    const actor = '607b78bc-0dca-4ba5-a34a-6bf4665913b2';
    expect(
      await addRealtimeLog(actor, null, 'warn', 'original', {
        cursor: 'original',
      })
    ).toEqual([actor, null, 'warn', 'original', { cursor: 'original' }]);
    await expect(
      addRealtimeLog('bad-workspace', actor, 'warn', 'original')
    ).rejects.toThrow();
    await expect(
      addRealtimeLog(actor, actor, 'warn', 'x'.repeat(16385))
    ).rejects.toThrow();
  });
});
