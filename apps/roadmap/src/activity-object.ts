import { DurableObject } from 'cloudflare:workers';
import { reserveRefresh, type Attempt } from './activity-fence';
import { observeActivity, type RoadmapObservation } from './activity-refresh';

export interface RoadmapEnv {
  ROADMAP_ACTIVITY?: DurableObjectNamespace<RoadmapActivity>;
  ROADMAP_REFRESH_ENABLED?: string;
}

export class RoadmapActivity extends DurableObject<RoadmapEnv> {
  async read() {
    return (await this.ctx.storage.get<RoadmapObservation>('snapshot')) ?? null;
  }

  async refresh(scheduledTime: number) {
    const now = Date.now();
    const storage = this.ctx.storage.kv;
    // A durable reservation spends the slot even if this invocation restarts.
    const attempt = reserveRefresh(
      this.env.ROADMAP_REFRESH_ENABLED === 'true',
      scheduledTime,
      now,
      storage.get<Attempt>('attempt')
    );
    if (!attempt) return;
    storage.put('attempt', attempt);
    const { slot } = attempt;
    await this.ctx.storage.sync();
    const snapshot = await observeActivity(now);
    // A delayed attempt cannot replace a newer observation.
    if (storage.get<{ slot: number }>('attempt')?.slot !== slot) return;
    this.ctx.storage.transactionSync(() => {
      storage.put('snapshot', snapshot);
      storage.put('attempt', { slot, failures: 0 });
    });
  }
}
