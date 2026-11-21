import { selectAbuseGuard } from '@tuturuuu/utils/abuse-guard/select';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureToolsAbuseGuard } from './abuse-guard';

const PEPPER = 'p'.repeat(40);

afterEach(() => {
  configureToolsAbuseGuard({});
  vi.unstubAllEnvs();
});

describe('configureToolsAbuseGuard', () => {
  it('routes assigned families through the service binding', async () => {
    const run = vi.fn(async (rpc: { steps: unknown[] }) => ({
      v: 1,
      steps: rpc.steps.map(() => ({ results: [{ op: 'kv.get', v: null }] })),
    }));
    configureToolsAbuseGuard({
      ABUSE_GUARD: { run },
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
      ABUSE_GUARD_FAMILIES: 'proxy',
    });
    const selection = selectAbuseGuard('proxy', {});
    expect(selection.kind).toBe('durable-object');
    if (selection.kind === 'durable-object')
      await selection.client.get('probe');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('turns an assigned family off when the pepper is missing', () => {
    configureToolsAbuseGuard({
      ABUSE_GUARD: { run: vi.fn() },
      ABUSE_GUARD_FAMILIES: 'proxy',
    });
    expect(selectAbuseGuard('proxy', {}).kind).toBe('off');
  });

  it('keeps assigned families off, never legacy, when the binding is absent', () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'proxy');
    vi.stubEnv('ABUSE_GUARD_KEY_PEPPER', PEPPER);
    configureToolsAbuseGuard({
      ABUSE_GUARD_FAMILIES: 'proxy',
      ABUSE_GUARD_KEY_PEPPER: PEPPER,
    });
    expect(selectAbuseGuard('proxy').kind).toBe('off');
    vi.stubEnv('ABUSE_GUARD_BACKEND', 'upstash');
    expect(selectAbuseGuard('proxy').kind).toBe('legacy');
    vi.stubEnv('ABUSE_GUARD_BACKEND', '');
    vi.stubEnv('ABUSE_GUARD_FAMILIES', '');
    expect(selectAbuseGuard('proxy').kind).toBe('legacy');
  });
});
