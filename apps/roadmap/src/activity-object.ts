import { DurableObject } from 'cloudflare:workers';
import { reserveRefresh, type Attempt } from './activity-fence';
import { observeActivity, type RoadmapObservation } from './activity-refresh';

export interface RoadmapEnv {
  ROADMAP_ACTIVITY?: DurableObjectNamespace<RoadmapActivity>;
  ROADMAP_REFRESH_ENABLED?: string;
}

export type StoredRoadmapObservation = Omit<RoadmapObservation, 'roadmap'> &
  Partial<Pick<RoadmapObservation, 'roadmap'>>;

export class RoadmapActivity extends DurableObject<RoadmapEnv> {
  async readSnapshot(): Promise<string | null> {
    const snapshot = await this.read();
    return snapshot ? JSON.stringify(snapshot) : null;
  }

  private async read() {
    return this.ctx.storage.get<StoredRoadmapObservation>('snapshot');
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
    const previous = await this.read();
    const snapshot = await observeActivity(now, previous?.roadmap?.deploys);
    // A delayed attempt cannot replace a newer observation.
    if (storage.get<{ slot: number }>('attempt')?.slot !== slot) return;
    this.ctx.storage.transactionSync(() => {
      storage.put('snapshot', snapshot);
      storage.put('attempt', { slot, failures: 0 });
    });
  }
}
