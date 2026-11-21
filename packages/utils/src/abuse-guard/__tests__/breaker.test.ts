// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD,
  ABUSE_GUARD_BREAKER_OPEN_MS,
  createGuardBreakerState,
  withGuardBreaker,
} from '../breaker';
import { AbuseGuardUnavailableError } from '../client';
import type { GuardRpc } from '../protocol';

type SelectModule = typeof import('../select');

const RPC = {} as GuardRpc;
const PEPPER = 'p'.repeat(40);

function reply(rpc: { steps: unknown[] }) {
  return {
    v: 1,
    steps: rpc.steps.map(() => ({ results: [{ op: 'kv.get', v: null }] })),
  };
}

function scripted() {
  const outcomes: (unknown | Error)[] = [];
  const transport = vi.fn(async () => {
    const next = outcomes.shift() ?? { ok: true };
    if (next instanceof Error) throw next;
    return next;
  });
  return { outcomes, transport };
}

const timeout = () => new AbuseGuardUnavailableError('timeout');

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    // Each bundled copy has its own class, so match by name.
    expect((error as Error).name).toBe('AbuseGuardUnavailableError');
    return (error as AbuseGuardUnavailableError).code;
  }
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000_000);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  warn.mockRestore();
});

describe('withGuardBreaker', () => {
  it('opens after N consecutive timeouts and then fails fast', async () => {
    const { outcomes, transport } = scripted();
    const guarded = withGuardBreaker(
      transport,
      createGuardBreakerState(),
      'test'
    );
    for (let i = 0; i < ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD; i += 1) {
      outcomes.push(timeout());
      expect(await codeOf(guarded(RPC))).toBe('timeout');
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toEqual({
      target: 'test',
      reason: 'threshold',
      failures: ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD,
      openMs: ABUSE_GUARD_BREAKER_OPEN_MS,
    });

    const calls = transport.mock.calls.length;
    expect(await codeOf(guarded(RPC))).toBe('guard_unavailable');
    vi.setSystemTime(1_000_000 + ABUSE_GUARD_BREAKER_OPEN_MS - 1);
    expect(await codeOf(guarded(RPC))).toBe('guard_unavailable');
    expect(transport).toHaveBeenCalledTimes(calls);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('closes after a successful half-open trial', async () => {
    const { outcomes, transport } = scripted();
    const guarded = withGuardBreaker(
      transport,
      createGuardBreakerState(),
      'test'
    );
    outcomes.push(timeout(), timeout(), timeout());
    for (let i = 0; i < 3; i += 1) await codeOf(guarded(RPC));

    vi.setSystemTime(1_000_000 + ABUSE_GUARD_BREAKER_OPEN_MS);
    expect(await codeOf(guarded(RPC))).toBe('ok');
    expect(await codeOf(guarded(RPC))).toBe('ok');
    expect(transport).toHaveBeenCalledTimes(5);
  });

  it('lets only one trial through while half-open', async () => {
    let release: (value: unknown) => void = () => undefined;
    const outcomes: Error[] = [timeout(), timeout(), timeout()];
    const transport = vi.fn(async () => {
      const next = outcomes.shift();
      if (next) throw next;
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const guarded = withGuardBreaker(
      transport,
      createGuardBreakerState(),
      'test'
    );
    for (let i = 0; i < 3; i += 1) await codeOf(guarded(RPC));

    vi.setSystemTime(1_000_000 + ABUSE_GUARD_BREAKER_OPEN_MS);
    const trial = guarded(RPC);
    expect(await codeOf(guarded(RPC))).toBe('guard_unavailable');
    release({ ok: true });
    expect(await codeOf(trial)).toBe('ok');
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it('reopens after a failed half-open trial', async () => {
    const { outcomes, transport } = scripted();
    const guarded = withGuardBreaker(
      transport,
      createGuardBreakerState(),
      'test'
    );
    outcomes.push(timeout(), timeout(), timeout());
    for (let i = 0; i < 3; i += 1) await codeOf(guarded(RPC));

    vi.setSystemTime(1_000_000 + ABUSE_GUARD_BREAKER_OPEN_MS);
    outcomes.push(new AbuseGuardUnavailableError('network'));
    expect(await codeOf(guarded(RPC))).toBe('network');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[1]).toMatchObject({ reason: 'trial_failed' });

    // A fresh full window must pass before the next trial.
    vi.setSystemTime(1_000_000 + 2 * ABUSE_GUARD_BREAKER_OPEN_MS - 1);
    expect(await codeOf(guarded(RPC))).toBe('guard_unavailable');
    vi.setSystemTime(1_000_000 + 2 * ABUSE_GUARD_BREAKER_OPEN_MS);
    expect(await codeOf(guarded(RPC))).toBe('ok');
  });

  it('never counts guard 4xx answers and resets on them', async () => {
    const { outcomes, transport } = scripted();
    const guarded = withGuardBreaker(
      transport,
      createGuardBreakerState(),
      'test'
    );
    outcomes.push(
      new AbuseGuardUnavailableError('bad_request'),
      new AbuseGuardUnavailableError('unauthorized'),
      new AbuseGuardUnavailableError('guard_limited'),
      new AbuseGuardUnavailableError('guard_stopped'),
      timeout(),
      timeout(),
      new AbuseGuardUnavailableError('guard_limited'),
      timeout(),
      timeout()
    );
    for (let i = 0; i < 9; i += 1) await codeOf(guarded(RPC));
    expect(await codeOf(guarded(RPC))).toBe('ok');
    expect(transport).toHaveBeenCalledTimes(10);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('abuse-guard breaker across bundled copies', () => {
  let copies: SelectModule[] = [];

  async function freshCopy(): Promise<SelectModule> {
    vi.resetModules();
    const copy = await import('../select.js');
    copies.push(copy);
    return copy;
  }

  afterEach(() => {
    for (const copy of copies) copy.configureAbuseGuardRuntime(null);
    copies = [];
  });

  it('shares one open circuit between two module copies', async () => {
    const entry = await freshCopy();
    const routes = await freshCopy();
    expect(routes).not.toBe(entry);

    let hung = true;
    const run = vi.fn((rpc: { steps: unknown[] }) =>
      hung ? new Promise<never>(() => undefined) : Promise.resolve(reply(rpc))
    );
    entry.configureAbuseGuardRuntime({
      binding: { run },
      pepper: PEPPER,
      families: 'proxy,replay',
      timeoutMs: '100',
    });

    const viaEntry = entry.selectAbuseGuard('proxy', {});
    const viaRoutes = routes.selectAbuseGuard('replay', {});
    if (
      viaEntry.kind !== 'durable-object' ||
      viaRoutes.kind !== 'durable-object'
    ) {
      throw new Error('unconfigured');
    }

    for (let i = 0; i < ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD; i += 1) {
      expect(await codeOf(viaEntry.client.get('k'))).toBe('timeout');
    }
    expect(run).toHaveBeenCalledTimes(3);

    // The other copy (and another family) fails fast on the shared circuit.
    hung = false;
    expect(await codeOf(viaRoutes.client.get('k'))).toBe('guard_unavailable');
    expect(run).toHaveBeenCalledTimes(3);

    vi.setSystemTime(Date.now() + ABUSE_GUARD_BREAKER_OPEN_MS);
    expect(await codeOf(viaRoutes.client.get('k'))).toBe('ok');
    expect(await codeOf(viaEntry.client.get('k'))).toBe('ok');
    expect(run).toHaveBeenCalledTimes(5);
  });
});
