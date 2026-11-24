/**
 * `tuturuuu-auth`: the first-party session's auth Worker (slice 4a, first
 * cut). It has no public ingress: no routes, no workers.dev and no preview
 * URLs; its HTTP handler answers 404 to everything. Callers reach it only
 * through a service binding to a named entry point, each checked with its
 * own caller key. This cut hosts the stop fence (`SessionControl`), the
 * budget (`SessionBudget`) and `ControlEntry`. Deployment is held: no CI
 * workflow publishes this Worker.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  type ControlPort,
  createControlEntry,
  type OpPoint,
} from './control-entry';
import {
  budgetStub,
  controlStub,
  type SessionBudget,
  type SessionControl,
} from './objects';
import { createOpCounter } from './op-counter';

export { SessionBudget, SessionControl } from './objects';

export interface Env {
  SESSION_CONTROL: DurableObjectNamespace<SessionControl>;
  SESSION_BUDGET: DurableObjectNamespace<SessionBudget>;
  TTR_SESSION_ENV?: string;
  TTR_SESSION_FENCE_FLOOR?: string;
  TTR_SESSION_DAILY_BUDGETS?: string;
  TTR_SESSION_ENTRY_CONTROL_KEY?: string;
}

// Isolate state: the operation counters.
let counter: ReturnType<typeof createOpCounter> | null = null;

function opCounter(env: Env) {
  counter ??= createOpCounter({
    now: () => Date.now(),
    flush: async (counts) => {
      const result = await budgetStub(env).flush(counts);
      if (!result.ok) throw new Error(`budget flush refused: ${result.error}`);
    },
  });
  return counter;
}

function recorder(env: Env, ctx: ExecutionContext) {
  return (point: OpPoint) => {
    // Refused calls make no Durable Object call, so they are not billed to a
    // category; the log line keeps them visible.
    if (point.outcome === 'unauthorized') {
      console.warn('[auth] entry refused', point.entry, point.method);
      return;
    }
    if (point.outcome === 'previous_key') {
      console.info(
        '[auth] entry accepted previous key',
        point.entry,
        point.method
      );
    }
    const tally = opCounter(env);
    tally.record(point.category);
    const flushing = tally.maybeFlush();
    if (flushing) ctx.waitUntil(flushing);
  };
}

/** The operator Worker's entry: read and change the stop fence. */
export class ControlEntry extends WorkerEntrypoint<Env> {
  private entry() {
    return createControlEntry({
      secret: this.env.TTR_SESSION_ENTRY_CONTROL_KEY,
      environment: this.env.TTR_SESSION_ENV,
      control: () => controlStub(this.env) as unknown as ControlPort,
      recordOp: recorder(this.env, this.ctx),
    });
  }

  readFence(key: unknown) {
    return this.entry().readFence(key);
  }

  setFence(key: unknown, mode: unknown, reason: unknown, actor: unknown) {
    return this.entry().setFence(key, mode, reason, actor);
  }

  parkBackground(key: unknown, reason: unknown, actor: unknown) {
    return this.entry().parkBackground(key, reason, actor);
  }

  resumeBackground(key: unknown, reason: unknown, actor: unknown) {
    return this.entry().resumeBackground(key, reason, actor);
  }
}

export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
