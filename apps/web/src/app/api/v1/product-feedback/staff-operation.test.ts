// @vitest-environment node
import { Cause, Effect } from '@tuturuuu/utils/effect';
import { describe, expect, it, vi } from 'vitest';
import { StaffReadError } from './staff-access';
import {
  createStaffListHandler,
  createStaffDetailHandler,
  type StaffReadDependencies,
} from './staff-read';
import {
  openStaffOperation,
  type StaffOperationContext,
  type StaffOperationPolicy,
  type StaffOperationRuntime,
} from './staff-operation';

const policy: StaffOperationPolicy = {
  durationMs: 10,
  scope: 'staff-list-detail-handler',
  provenance: 'synthetic test-only policy; no approved production duration',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture() {
  let time = 100;
  let wake = () => {};
  const releases: ReturnType<typeof vi.fn>[] = [];
  const controller = new AbortController();
  const request = new Request('https://synthetic.invalid/feedback', {
    signal: controller.signal,
  });
  const add = vi.spyOn(request.signal, 'addEventListener');
  const remove = vi.spyOn(request.signal, 'removeEventListener');
  const clock: StaffOperationRuntime = {
    now: () => time,
    schedule: vi.fn<StaffOperationRuntime['schedule']>((callback, _delay) => {
      wake = callback;
      const release = vi.fn();
      releases.push(release);
      return release;
    }),
  };
  const operation = openStaffOperation(request, policy, clock);
  if (!operation) throw new Error('synthetic fixture failed');
  return {
    operation,
    request,
    controller,
    clock,
    add,
    remove,
    releases,
    time: (value: number) => {
      time = value;
    },
    fire: () => wake(),
  };
}
const failure = (status: number) =>
  Response.json({ error: 'feedback_unavailable' }, { status });
const publish = (value: unknown) => Response.json(value);
async function safe(response: Response) {
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"error":"feedback_unavailable"}');
}

describe('actual Effect invocation owner, prospective unexecuted controls', () => {
  it.each([0, -1, NaN, Infinity, Number.MAX_VALUE])(
    'invalid duration %s dispatches nothing',
    async (durationMs) => {
      const callback = vi.fn();
      const clock = { now: () => Number.MAX_VALUE, schedule: callback };
      expect(
        openStaffOperation(
          new Request('https://synthetic.invalid'),
          { ...policy, durationMs },
          clock
        )
      ).toBeNull();
      expect(callback).not.toHaveBeenCalled();
    }
  );
  it('rejects failed origin, absent provenance and wrong scope before scheduling', () => {
    const schedule = vi.fn();
    const request = new Request('https://synthetic.invalid');
    expect(
      openStaffOperation(request, policy, {
        now: () => {
          throw new Error('PRIVATE');
        },
        schedule,
      })
    ).toBeNull();
    expect(
      openStaffOperation(
        request,
        { ...policy, provenance: '' },
        { now: () => 0, schedule }
      )
    ).toBeNull();
    const wrongScope = { ...policy };
    Reflect.set(wrongScope, 'scope', 'unapproved-scope');
    expect(
      openStaffOperation(request, wrongScope, { now: () => 0, schedule })
    ).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });
  it('preabort installs no incoming listener or timer', () => {
    const controller = new AbortController();
    controller.abort('PRIVATE');
    const request = new Request('https://synthetic.invalid', {
      signal: controller.signal,
    });
    const add = vi.spyOn(request.signal, 'addEventListener');
    const schedule = vi.fn();
    expect(
      openStaffOperation(request, policy, { now: () => 0, schedule })
    ).toBeNull();
    expect(add).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
  it('covers abort during incoming listener registration', async () => {
    const controller = new AbortController();
    const request = new Request('https://synthetic.invalid', {
      signal: controller.signal,
    });
    const original = request.signal.addEventListener.bind(request.signal);
    vi.spyOn(request.signal, 'addEventListener').mockImplementation(
      (...args) => {
        original(...args);
        controller.abort();
      }
    );
    const remove = vi.spyOn(request.signal, 'removeEventListener');
    const callback = vi.fn(async () => 'PRIVATE');
    const schedule = vi.fn();
    const operation = openStaffOperation(request, policy, {
      now: () => 0,
      schedule,
    });
    if (!operation) throw new Error('owner missing');
    await safe(
      await operation.run(operation.phase(callback), publish, failure)
    );
    expect(callback).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
  it.each(['success', 'rejection'] as const)(
    'interrupts ignored actor and consumes late %s',
    async (outcome) => {
      const f = fixture();
      const started = deferred<void>();
      const producer = deferred<string>();
      const callback = vi.fn(async (context: StaffOperationContext) => {
        expect(context.signal).toBe(f.operation.signal);
        started.resolve();
        return producer.promise;
      });
      const next = vi.fn(async () => 'PRIVATE_NEXT');
      const pending = f.operation.run(
        f.operation
          .phase(callback)
          .pipe(Effect.flatMap(() => f.operation.phase(next))),
        publish,
        failure
      );
      await started.promise;
      f.controller.abort('PRIVATE_REASON');
      await safe(await pending);
      expect(next).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledOnce();
      if (outcome === 'success') producer.resolve('PRIVATE_BODY');
      else producer.reject(new StaffReadError(403));
      await Promise.resolve();
      await Promise.resolve();
      expect(f.remove).toHaveBeenCalledWith('abort', f.add.mock.calls[0]![1]);
      expect(f.releases[0]).toHaveBeenCalledOnce();
    }
  );
  it.each([110, 109, NaN, Infinity])(
    'inclusive expiry or invalid/backward reading %s uses one D',
    async (last) => {
      const f = fixture();
      f.time(109.5);
      f.operation.check();
      f.time(last);
      const callback = vi.fn(async () => 'PRIVATE');
      await safe(
        await f.operation.run(f.operation.phase(callback), publish, failure)
      );
      expect(f.operation.cutoff).toBe(110);
      expect(callback).not.toHaveBeenCalled();
    }
  );
  it('early timer re-arms only the remaining allowance, then interrupts at D', async () => {
    const f = fixture();
    const started = deferred<void>();
    const pending = f.operation.run(
      f.operation.phase(async () => {
        started.resolve();
        return new Promise<string>(() => {});
      }),
      publish,
      failure
    );
    await started.promise;
    f.time(104);
    f.fire();
    expect(f.clock.schedule).toHaveBeenLastCalledWith(expect.any(Function), 6);
    f.time(110);
    f.fire();
    await safe(await pending);
  });
  it.each([401, 403] as const)(
    'preserves simple in-budget %s and rejects mixed/defect causes',
    async (status) => {
      const f = fixture();
      expect(
        (
          await f.operation.run(
            Effect.fail(new StaffReadError(status)),
            publish,
            failure
          )
        ).status
      ).toBe(status);
      const mixed = fixture();
      await safe(
        await mixed.operation.run(
          Effect.failCause(
            Cause.parallel(
              Cause.fail(new StaffReadError(status)),
              Cause.die('PRIVATE')
            )
          ),
          publish,
          failure
        )
      );
      const defect = fixture();
      await safe(
        await defect.operation.run(Effect.die('PRIVATE'), publish, failure)
      );
    }
  );
  it('acknowledges cleanup before publication and retirement, with no new allowance', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const ack = deferred<void>();
    const close = vi.fn(() => {
      entered.resolve();
      return ack.promise;
    });
    f.operation.onStop(close);
    const output = vi.fn(publish);
    const pending = f.operation.run(Effect.succeed('safe'), output, failure);
    await entered.promise;
    expect(output).not.toHaveBeenCalled();
    f.time(109);
    ack.resolve();
    expect((await pending).status).toBe(200);
    expect(close).toHaveBeenCalledOnce();
    expect(f.operation.signal.aborted).toBe(true);
    expect(() => f.operation.check()).not.toThrow();
    expect(f.releases[0]).toHaveBeenCalledOnce();
  });
  it.each(['throw', 'reject', 'pending'] as const)(
    'cleanup %s blocks success without private secondary output',
    async (kind) => {
      const f = fixture();
      const started = deferred<void>();
      f.operation.onStop(() => {
        started.resolve();
        if (kind === 'throw') throw new Error('PRIVATE');
        if (kind === 'reject') return Promise.reject('PRIVATE');
        return new Promise<void>(() => {});
      });
      const output = vi.fn(publish);
      const pending = f.operation.run(
        Effect.succeed('PRIVATE'),
        output,
        failure
      );
      await started.promise;
      if (kind === 'pending') {
        f.time(110);
        f.fire();
      }
      await safe(await pending);
      expect(output).not.toHaveBeenCalled();
    }
  );
  it('reentrant stop shares cached acknowledgements; late allocation closes once', async () => {
    const f = fixture();
    const close = vi.fn(async (_value: string) => {});
    const assign = f.operation.resource(close);
    const reentrant = vi.fn(() => {
      f.controller.abort();
      f.controller.abort();
    });
    f.operation.onStop(reentrant);
    f.controller.abort();
    assign('PRIVATE_RESOURCE');
    await safe(
      await f.operation.run(Effect.succeed('PRIVATE'), publish, failure)
    );
    expect(close).toHaveBeenCalledExactlyOnceWith('PRIVATE_RESOURCE');
    expect(reentrant).toHaveBeenCalledOnce();
  });
  it('reentrant late cleanup registration joins the prepublication barrier', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const ack = deferred<void>();
    const late = vi.fn(() => {
      entered.resolve();
      return ack.promise;
    });
    f.operation.onStop(() => {
      f.operation.onStop(late);
    });
    const output = vi.fn(publish);
    const pending = f.operation.run(Effect.succeed('safe'), output, failure);
    await entered.promise;
    expect(output).not.toHaveBeenCalled();
    ack.resolve();
    expect((await pending).status).toBe(200);
    expect(late).toHaveBeenCalledOnce();
  });
  it('serialization expiry and retirement failure select safe output before handoff', async () => {
    const f = fixture();
    await safe(
      await f.operation.run(
        Effect.succeed('PRIVATE'),
        (value) => {
          const response = publish(value);
          f.time(110);
          return response;
        },
        failure
      )
    );
    const g = fixture();
    g.operation.signal.addEventListener('abort', () => {
      g.operation.onStop(() => Promise.reject('PRIVATE_RETIREMENT'));
    });
    await safe(
      await g.operation.run(Effect.succeed('PRIVATE'), publish, failure)
    );
  });
  it('clock failure and synchronous timer retirement failure stay safe and release the bridge', async () => {
    const f = fixture();
    vi.spyOn(f.clock, 'now').mockImplementation(() => {
      throw new Error('PRIVATE_CLOCK');
    });
    await safe(
      await f.operation.run(Effect.succeed('PRIVATE'), publish, failure)
    );
    const g = fixture();
    g.releases[0]!.mockImplementation(() => {
      throw new Error('PRIVATE_TIMER');
    });
    await safe(
      await g.operation.run(Effect.succeed('PRIVATE'), publish, failure)
    );
    expect(g.remove).toHaveBeenCalled();
    expect(g.operation.signal.aborted).toBe(true);
  });
  it('releases phase listeners even while ignored producers remain and isolates owners', async () => {
    const add = vi.spyOn(AbortSignal.prototype, 'addEventListener');
    const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    const a = fixture();
    const b = fixture();
    const started = deferred<void>();
    let phase!: AbortSignal;
    // Instrument the actual tryPromise phase signal, not a substitute runner.
    const program = Effect.tryPromise({
      try: (signal: AbortSignal) => {
        phase = signal;
        return Promise.resolve();
      },
      catch: () => new StaffReadError(503),
    }).pipe(
      Effect.flatMap(() =>
        a.operation.phase(async () => {
          started.resolve();
          return new Promise<string>(() => {});
        })
      )
    );
    const pending = a.operation.run(program, publish, failure);
    await started.promise;
    expect(phase).toBeDefined();
    a.controller.abort();
    await safe(await pending);
    expect(b.operation.signal.aborted).toBe(false);
    expect(
      (await b.operation.run(Effect.succeed('safe'), publish, failure)).status
    ).toBe(200);
    expect(a.remove).toHaveBeenCalled();
    expect(b.remove).toHaveBeenCalled();
    const phaseCallbacks = add.mock.calls.filter(
      ([event, listener]) =>
        event === 'abort' &&
        typeof listener === 'function' &&
        listener.name === 'abort'
    );
    expect(phaseCallbacks.length).toBeGreaterThan(0);
    for (const [, listener] of phaseCallbacks)
      expect(remove).toHaveBeenCalledWith('abort', listener);
    add.mockRestore();
    remove.mockRestore();
  });
});

// Actual handler composition controls; no copied historical Auth suite.
const actor = '91800000-0000-4000-8000-000000000001';
function dependencies(
  overrides: Partial<StaffReadDependencies> = {}
): StaffReadDependencies {
  return {
    actor: vi.fn(async () => actor),
    enabled: vi.fn(() => true),
    list: vi.fn(async () => ({ items: [] })),
    detail: vi.fn(async () => null),
    ...overrides,
  };
}
async function unavailableResponse(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Authorization, Cookie');
  expect(await response.json()).toEqual({
    error: { code: 'feedback_unavailable' },
  });
}
describe('actual list/detail handler lifetime, prospective only', () => {
  it('preabort precedes actor, flag, malformed parsing and all content', async () => {
    const d = dependencies();
    const controller = new AbortController();
    controller.abort('PRIVATE');
    const request = new Request('https://synthetic.invalid?limit=bad', {
      signal: controller.signal,
    });
    await unavailableResponse(await createStaffListHandler(d, policy)(request));
    await unavailableResponse(
      await createStaffDetailHandler(d, policy)(request, 'bad')
    );
    expect(d.actor).not.toHaveBeenCalled();
    expect(d.enabled).not.toHaveBeenCalled();
    expect(d.list).not.toHaveBeenCalled();
    expect(d.detail).not.toHaveBeenCalled();
  });
  it.each(['actor', 'list', 'detail'] as const)(
    'ignored %s success or 401/403 after stop is suppressed without retry',
    async (phase) => {
      for (const outcome of ['success', 401, 403] as const) {
        const controller = new AbortController();
        const started = deferred<void>();
        const producer = deferred<unknown>();
        const callback = vi.fn(
          async (_request?: unknown, _operation?: unknown) => {
            started.resolve();
            return producer.promise;
          }
        );
        const d = dependencies(
          phase === 'actor'
            ? {
                actor: async (request, operation) => {
                  await callback(request, operation);
                  return 'PRIVATE_LATE_ACTOR';
                },
              }
            : { [phase]: callback }
        );
        const request = new Request('https://synthetic.invalid', {
          signal: controller.signal,
        });
        const pending =
          phase === 'detail'
            ? createStaffDetailHandler(d, policy)(request, actor)
            : createStaffListHandler(d, policy)(request);
        await started.promise;
        controller.abort('PRIVATE');
        await unavailableResponse(await pending);
        expect(callback).toHaveBeenCalledOnce();
        if (phase === 'actor') {
          expect(d.enabled).not.toHaveBeenCalled();
          expect(d.list).not.toHaveBeenCalled();
        }
        if (outcome === 'success')
          producer.resolve({ items: [{ body: 'PRIVATE_LATE_BODY' }] });
        else producer.reject(new StaffReadError(outcome));
        await Promise.resolve();
        await Promise.resolve();
      }
    }
  );
  it('actor consumes the original allowance and content gets the exact same owner/cutoff', async () => {
    let time = 0;
    let context: unknown;
    const clock = { now: () => time, schedule: () => () => {} };
    const d = dependencies({
      actor: async (_request, operation) => {
        context = operation;
        time = 9;
        return actor;
      },
      list: vi.fn<StaffReadDependencies['list']>(
        async (_actor, _query, operation) => {
          expect(operation).toBe(context);
          time = 10;
          return { items: [] };
        }
      ),
    });
    await unavailableResponse(
      await createStaffListHandler(
        d,
        policy,
        clock
      )(new Request('https://synthetic.invalid'))
    );
    expect(d.list).toHaveBeenCalledOnce();
    const stopped = dependencies({
      actor: async () => {
        time = 20;
        return actor;
      },
    });
    time = 10;
    await unavailableResponse(
      await createStaffListHandler(
        stopped,
        policy,
        clock
      )(new Request('https://synthetic.invalid?limit=bad'))
    );
    expect(stopped.enabled).not.toHaveBeenCalled();
    expect(stopped.list).not.toHaveBeenCalled();
  });
  it('actual handler cleanup rejection prevents publication of staged projected rows', async () => {
    const d = dependencies({
      list: async (_actor, _query, operation) => {
        operation.onStop(() => Promise.reject('PRIVATE_CLEANUP'));
        return { items: [] };
      },
    });
    await unavailableResponse(
      await createStaffListHandler(
        d,
        policy
      )(new Request('https://synthetic.invalid'))
    );
  });
  it('expiry during actual Response serialization suppresses the constructed success', async () => {
    let time = 0;
    const original = Response.json;
    const serialize = vi
      .spyOn(Response, 'json')
      .mockImplementation((body, init) => {
        const response = original(body, init);
        if (!init?.status || init.status === 200) time = 10;
        return response;
      });
    try {
      await unavailableResponse(
        await createStaffListHandler(dependencies(), policy, {
          now: () => time,
          schedule: () => () => {},
        })(new Request('https://synthetic.invalid'))
      );
    } finally {
      serialize.mockRestore();
    }
  });
});
