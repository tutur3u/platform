import { describe, expect, it } from 'vite-plus/test';
import { admit, type FenceEnv } from './fence';

function controlEnv() {
  let reserved = 0;
  const stub = {
    async reserve(_family: string, ops: number) {
      reserved += ops;
      return 'open' as const;
    },
  };
  const env = {
    GUARD_CONTROL: { idFromName: () => 'control', get: () => stub },
  } as unknown as FenceEnv;
  return { env, total: () => reserved };
}

describe('durable allowances', () => {
  it('reserves each concurrent batch before execution and retains skipped work', async () => {
    const { env, total } = controlEnv();
    await Promise.all([admit(env, 'proxy', 2), admit(env, 'proxy', 1)]);
    expect(total()).toBe(3);
    // Skipping a subject operation cannot erase an already durable allowance.
    await admit(env, 'proxy', 1);
    expect(total()).toBe(4);
  });
});
