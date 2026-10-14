import { DurableObject } from 'cloudflare:workers';
import { unavailableAuthority } from './authority';
import type { Authority, DueJob, Identity } from './contracts';
import { DueJobEngine, nextWake } from './engine';
import { PlanReviewEngine, type SelectedApproval } from './review';
import {
  type SqlExecutor,
  SqliteJobStore,
  SqliteReviewStore,
} from './sqlite-store';

export interface AdapterStorage {
  sql: SqlExecutor;
  transactionSync<T>(operation: () => T): T;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

/** Storage/clock seam for finite synthetic tests. Production authority defaults denied. */
export function createProactiveAdapter(
  storage: AdapterStorage,
  authority: Authority = unavailableAuthority,
  clock: () => number = Date.now
) {
  const atomic = <T>(operation: () => T) => storage.transactionSync(operation);
  const jobs = new SqliteJobStore(storage.sql, atomic);
  const reviews = new SqliteReviewStore(storage.sql, atomic);
  const due = new DueJobEngine(jobs, authority, clock, () =>
    crypto.randomUUID()
  );
  const review = new PlanReviewEngine(jobs, reviews, authority, clock);
  async function reconcileWake() {
    const at = nextWake(jobs.read());
    if (at === null) await storage.deleteAlarm();
    else await storage.setAlarm(at);
  }
  return {
    async submit(job: DueJob) {
      const outcome = await due.submit(job);
      await reconcileWake();
      return outcome;
    },
    async cancel(identity: Identity) {
      const outcome = due.stop(identity, 'user-cancelled');
      review.invalidate(identity, 'user-cancelled');
      await reconcileWake();
      return outcome;
    },
    async alarm() {
      await due.execute();
      const state = jobs.read();
      if (state?.phase.kind === 'completed') await review.prepare(state.job);
      await reconcileWake();
    },
    review,
    inspect() {
      return { due: jobs.read(), review: reviews.read() };
    },
  };
}

/** Unbound source adapter. No Worker export, namespace migration or ingress. */
export class ProactiveDryRunObject extends DurableObject {
  private readonly adapter = createProactiveAdapter(this.ctx.storage);

  submit(job: DueJob) {
    return this.adapter.submit(job);
  }
  cancel(identity: Identity) {
    return this.adapter.cancel(identity);
  }
  alarm() {
    return this.adapter.alarm();
  }
  inspect() {
    return this.adapter.inspect();
  }
  approve(identity: Identity, approval: SelectedApproval) {
    return this.adapter.review.approve(identity, approval);
  }
  executeApproved(identity: Identity) {
    return this.adapter.review.execute(identity);
  }
}
