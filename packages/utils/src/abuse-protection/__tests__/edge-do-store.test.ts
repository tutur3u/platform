import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AbuseGuardBinding } from '../../abuse-guard/client';
import { configureAbuseGuardRuntime } from '../../abuse-guard/select';
import {
  blockIPEdge,
  clearEdgeAbuseProtectionControlsCache,
  isIPBlockedEdge,
  readEdgeAbuseProtectionControls,
} from '../edge';
import { getCachedTrustEntries, setCachedTrustEntry } from '../edge-trust';

const ip = '192.0.2.12';
const subject = 'session:synthetic-fixture';

function guardStore() {
  const entries = new Map<string, string>();
  const run = vi.fn<AbuseGuardBinding['run']>(async (rpc) => ({
    v: rpc.v,
    steps: rpc.steps.map(({ p, cmds }) => ({
      results: cmds.map((cmd) => {
        if (cmd.op === 'kv.get')
          return { op: cmd.op, v: entries.get(`${p}:${cmd.k}`) ?? null };
        if (cmd.op === 'kv.set') {
          entries.set(`${p}:${cmd.k}`, cmd.v);
          return { op: cmd.op, set: true };
        }
        throw new Error(`Unexpected guard operation ${cmd.op}`);
      }),
    })),
  }));
  configureAbuseGuardRuntime({
    binding: { run },
    pepper: 'synthetic-guard-pepper-0123456789-0123456789',
    families: 'proxy',
  });
  return run;
}

describe('proxy edge state with the bound guard and no Redis', () => {
  const outbound = vi.fn();
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
    vi.stubEnv('ABUSE_GUARD_BACKEND', undefined);
    vi.stubGlobal('fetch', outbound);
    outbound.mockReset();
    clearEdgeAbuseProtectionControlsCache();
  });

  afterEach(() => {
    expect(outbound).not.toHaveBeenCalled();
    configureAbuseGuardRuntime(null);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('writes and reads an IP block through the proxy guard', async () => {
    const run = guardStore();
    expect(await isIPBlockedEdge(ip)).toBeNull();
    const block = await blockIPEdge(ip, 'api_abuse');
    expect(block?.blockLevel).toBe(1);
    expect(await isIPBlockedEdge(ip)).toEqual(block);
    expect(await isIPBlockedEdge('192.0.2.13')).toBeNull();
    expect(run.mock.calls.every(([rpc]) => rpc.family === 'proxy')).toBe(true);
    expect(JSON.stringify(run.mock.calls)).not.toContain(ip);
  });

  it('looks up the verified subject and preserves its trust limit', async () => {
    const run = guardStore();
    await setCachedTrustEntry(subject, { m: 3, verified: true });
    expect(await getCachedTrustEntries([subject, 'session:miss'])).toEqual(
      new Map([[subject, { m: 3, verified: true }]])
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(run.mock.calls)).not.toContain(subject);
  });

  it('keeps limits enabled and withholds trust uplift on a guard outage', async () => {
    const run = guardStore();
    run.mockRejectedValue(new Error('fixture guard unavailable'));
    expect(await isIPBlockedEdge(ip)).toBeNull();
    expect(await getCachedTrustEntries([subject])).toEqual(new Map());
    expect(await readEdgeAbuseProtectionControls()).toMatchObject({
      ipBlockingEnabled: true,
      rateLimitsEnabled: true,
    });
    expect(run).toHaveBeenCalled();
  });
});
