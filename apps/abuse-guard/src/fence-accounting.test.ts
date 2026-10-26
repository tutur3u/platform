import { describe, expect, it } from 'vite-plus/test';
import { createControlState } from './control-state';
import { admit, type FenceEnv, refundAdmitted } from './fence';

/** A control object stub that records every reported delta. */
function controlEnv() {
  const reported: number[] = [];
  const stub = {
    async report(_family: string, delta: number) {
      reported.push(delta);
      return createControlState(Date.now());
    },
  };
  const env = {
    GUARD_CONTROL: {
      idFromName: () => 'control',
      get: () => stub,
    },
    // Refresh on every admission so flushes interleave deterministically.
    ABUSE_GUARD_CONTROL_CACHE_MS: '0',
  } as unknown as FenceEnv;
  const total = () => reported.reduce((sum, delta) => sum + delta, 0);
  return { env, total };
}

describe('skipped-step refunds under a concurrent flush', () => {
  it('stays exact in aggregate when other usage is still buffered', async () => {
    const { env, total } = controlEnv();
    // A admits two steps; B's admission flushes them while A is in flight.
    await admit(env, 'proxy', 2);
    await admit(env, 'proxy', 1);
    // A's second step was skipped; B's buffered unit absorbs the refund.
    refundAdmitted('proxy', 1);
    await admit(env, 'proxy', 0);
    // Executed: A ran 1 step, B ran 1.
    expect(total()).toBe(2);
  });

  it('overcounts conservatively when nothing is buffered to refund', async () => {
    const { env, total } = controlEnv();
    await admit(env, 'replay', 2);
    // A concurrent refresh flushes A's two admitted steps.
    await admit(env, 'replay', 0);
    refundAdmitted('replay', 1);
    await admit(env, 'replay', 0);
    // A executed one step but two stay counted: early stop, never late.
    expect(total()).toBe(2);
    expect(total()).toBeGreaterThanOrEqual(1);
  });
});
