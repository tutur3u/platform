// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD,
  ABUSE_GUARD_BREAKER_OPEN_MS,
  createGuardBreakerState,
  withGuardBreaker,
} from '../breaker';
import { AbuseGuardUnavailableError } from '../client';
import type { AbuseGuardFamily, GuardRpc } from '../protocol';

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

  it('lets a new trial replace one that never settles', async () => {
    // A cancelled request (Worker client disconnect) never settles its trial.
    const outcomes: Error[] = [timeout(), timeout(), timeout()];
    let hang = true;
    let rejectStale: (error: unknown) => void = () => undefined;
    const transport = vi.fn(async () => {
      const next = outcomes.shift();
      if (next) throw next;
      if (hang) {
        hang = false;
        return new Promise((_, reject) => {
          rejectStale = reject;
        });
      }
      return { ok: true };
    });
    const guarded = withGuardBreaker(
      transport,
      createGuardBreakerState(),
      'test'
    );
    for (let i = 0; i < 3; i += 1) await codeOf(guarded(RPC));

    vi.setSystemTime(1_000_000 + ABUSE_GUARD_BREAKER_OPEN_MS);
    const abandoned = guarded(RPC);
    vi.setSystemTime(1_000_000 + 2 * ABUSE_GUARD_BREAKER_OPEN_MS - 1);
    expect(await codeOf(guarded(RPC))).toBe('guard_unavailable');

    vi.setSystemTime(1_000_000 + 2 * ABUSE_GUARD_BREAKER_OPEN_MS);
    expect(await codeOf(guarded(RPC))).toBe('ok');
    expect(transport).toHaveBeenCalledTimes(5);

    // The superseded trial failing late must not reopen a closed circuit.
    rejectStale(timeout());
    expect(await codeOf(abandoned)).toBe('timeout');
    expect(await codeOf(guarded(RPC))).toBe('ok');
    expect(warn).toHaveBeenCalledTimes(1);
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

  function configure(
    copy: SelectModule,
    run: (rpc: GuardRpc) => Promise<unknown>
  ) {
    copy.configureAbuseGuardRuntime({
      binding: { run },
      pepper: PEPPER,
      families: 'proxy,replay,ratelimit,password',
      timeoutMs: '100',
    });
  }

  function clientOf(copy: SelectModule, family: AbuseGuardFamily) {
    const selection = copy.selectAbuseGuard(family, {});
    if (selection.kind !== 'durable-object') throw new Error('unconfigured');
    return selection.client;
  }

  function hangingBinding() {
    const hungFamilies = new Set<AbuseGuardFamily>();
    const run = vi.fn((rpc: GuardRpc) =>
      hungFamilies.has(rpc.family)
        ? new Promise<never>(() => undefined)
        : Promise.resolve(reply(rpc))
    );
    return { hungFamilies, run };
  }

  it('shares one family circuit between two module copies', async () => {
    const entry = await freshCopy();
    const routes = await freshCopy();
    expect(routes).not.toBe(entry);

    const { hungFamilies, run } = hangingBinding();
    configure(entry, run);
    hungFamilies.add('proxy');

    for (let i = 0; i < ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD; i += 1) {
      expect(await codeOf(clientOf(entry, 'proxy').get('k'))).toBe('timeout');
    }
    expect(run).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.at(-1)?.[1]).toMatchObject({
      target: 'binding',
      family: 'proxy',
      reason: 'threshold',
    });

    // The other copy fails fast on the same family's shared circuit.
    hungFamilies.clear();
    expect(await codeOf(clientOf(routes, 'proxy').get('k'))).toBe(
      'guard_unavailable'
    );
    expect(run).toHaveBeenCalledTimes(3);

    vi.setSystemTime(Date.now() + ABUSE_GUARD_BREAKER_OPEN_MS);
    expect(await codeOf(clientOf(routes, 'proxy').get('k'))).toBe('ok');
    expect(await codeOf(clientOf(entry, 'proxy').get('k'))).toBe('ok');
    expect(run).toHaveBeenCalledTimes(5);
  });

  it('opens only the failing family; others on the target call through', async () => {
    const entry = await freshCopy();
    const routes = await freshCopy();
    const { hungFamilies, run } = hangingBinding();
    configure(entry, run);
    hungFamilies.add('ratelimit');

    for (let i = 0; i < ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD; i += 1) {
      expect(await codeOf(clientOf(entry, 'ratelimit').get('k'))).toBe(
        'timeout'
      );
    }
    expect(await codeOf(clientOf(routes, 'ratelimit').get('k'))).toBe(
      'guard_unavailable'
    );
    expect(run).toHaveBeenCalledTimes(3);

    // Same binding target, other families, both copies: still served.
    for (const copy of [entry, routes]) {
      for (const family of ['password', 'replay', 'proxy'] as const) {
        expect(await codeOf(clientOf(copy, family).get('k'))).toBe('ok');
      }
    }
    expect(run).toHaveBeenCalledTimes(9);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('drops every family circuit when the binding changes', async () => {
    const copy = await freshCopy();
    const first = hangingBinding();
    configure(copy, first.run);
    first.hungFamilies.add('proxy');
    first.hungFamilies.add('replay');
    for (const family of ['proxy', 'replay'] as const) {
      for (let i = 0; i < ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD; i += 1) {
        await codeOf(clientOf(copy, family).get('k'));
      }
      expect(await codeOf(clientOf(copy, family).get('k'))).toBe(
        'guard_unavailable'
      );
    }

    const second = hangingBinding();
    configure(copy, second.run);
    for (const family of ['proxy', 'replay'] as const) {
      expect(await codeOf(clientOf(copy, family).get('k'))).toBe('ok');
    }
    expect(second.run).toHaveBeenCalledTimes(2);
  });
});
