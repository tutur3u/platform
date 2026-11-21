// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

type SelectModule = typeof import('../select');

const PEPPER = 'p'.repeat(40);

function reply(rpc: { steps: unknown[] }) {
  return {
    v: 1,
    steps: rpc.steps.map(() => ({ results: [{ op: 'kv.get', v: null }] })),
  };
}

/** A fresh module graph, as a Vite RSC Worker's `ssr` and `rsc` bundles are. */
async function freshCopy(): Promise<SelectModule> {
  vi.resetModules();
  return import('../select.js');
}

let copies: SelectModule[] = [];

afterEach(() => {
  for (const copy of copies) copy.configureAbuseGuardRuntime(null);
  copies = [];
});

describe('abuse-guard runtime override across bundled copies', () => {
  it('serves a family through the binding another copy installed', async () => {
    const entry = await freshCopy();
    const routes = await freshCopy();
    copies = [entry, routes];
    expect(routes).not.toBe(entry);

    const run = vi.fn(async (rpc: { steps: unknown[] }) => reply(rpc));
    entry.configureAbuseGuardRuntime({
      binding: { run },
      pepper: PEPPER,
      families: 'proxy',
    });

    // The route-side copy has no HTTP guard env, so a module-local override
    // would report `off` here.
    const selection = routes.selectAbuseGuard('proxy', {
      ABUSE_GUARD_FAMILIES: 'proxy',
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
    });
    expect(selection.kind).toBe('durable-object');
    if (selection.kind === 'durable-object') await selection.client.get('k');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('drops clients cached by another copy when the binding changes', async () => {
    const entry = await freshCopy();
    const routes = await freshCopy();
    copies = [entry, routes];

    const first = vi.fn(async (rpc: { steps: unknown[] }) => reply(rpc));
    entry.configureAbuseGuardRuntime({
      binding: { run: first },
      pepper: PEPPER,
      families: 'proxy',
    });
    const before = routes.selectAbuseGuard('proxy', {});
    if (before.kind !== 'durable-object') throw new Error('unconfigured');
    await before.client.get('k');

    const second = vi.fn(async (rpc: { steps: unknown[] }) => reply(rpc));
    entry.configureAbuseGuardRuntime({
      binding: { run: second },
      pepper: PEPPER,
      families: 'proxy',
    });
    const after = routes.selectAbuseGuard('proxy', {});
    if (after.kind !== 'durable-object') throw new Error('unconfigured');
    expect(after.client).not.toBe(before.client);
    await after.client.get('k');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    entry.configureAbuseGuardRuntime(null);
    expect(routes.selectAbuseGuard('proxy', {}).kind).toBe('legacy');
  });
});
