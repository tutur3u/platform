import type { Deployment, EnvironmentMeta, Lane } from './types';

// Storage port for one environment. Every method is synchronous so a Durable
// Object call reads and writes without yielding to another request.
export interface EnvironmentStore {
  readMeta(): EnvironmentMeta;
  writeMeta(meta: EnvironmentMeta): void;
  readLane(lane: string): Lane | null;
  writeLane(lane: Lane): void;
  listLanes(): Lane[];
  readDeployment(id: string): Deployment | null;
  findByIdempotencyKey(key: string): Deployment | null;
  writeDeployment(deployment: Deployment): void;
  // Deployments of one lane in queue order (oldest first).
  queued(lane: string): Deployment[];
  // Most recent deployments of one lane, newest first.
  recent(lane: string, limit: number): Deployment[];
  // Publishing deployments across every lane.
  publishing(): Deployment[];
  // Queued deployments across every lane created before the cutoff.
  queuedBefore(cutoff: number): Deployment[];
  // Succeeded deployment with the highest publish epoch: what the lane serves.
  current(lane: string): Deployment | null;
  // Highest run id of a queued, publishing or succeeded deploy in the lane.
  maxDeployRunId(lane: string): number | null;
  nextSeq(): number;
  // Lanes that have a queued or publishing deployment.
  openLaneCount(): number;
  // Deletes the oldest finished deployments beyond `keep`, never `protectId`
  // nor an unknown deployment that finished at or after `unknownSince`, which
  // can still reconcile. One publisher per lane and the lease plus grace
  // bound how many such rows a lane can hold.
  pruneTerminal(
    lane: string,
    keep: number,
    protectId: string | null,
    unknownSince: number
  ): void;
  // Whether the lane has an unknown deployment that finished at or after the
  // cutoff.
  hasUnknownSince(lane: string, cutoff: number): boolean;
  // Deletes a lane and its deployments.
  deleteLane(lane: string): void;
  // Adds one to the UTC day's counter and returns the new value. At the
  // limit it returns null without writing, unless `force` is set.
  countRequest(day: string, limit: number, force: boolean): number | null;
}

export function defaultMeta(now: number): EnvironmentMeta {
  return {
    stopped: false,
    stopRevision: 0,
    stopReason: null,
    stoppedBy: null,
    updatedAt: now,
  };
}

const OPEN = new Set(['queued', 'publishing']);
const TERMINAL_PRUNABLE = new Set([
  'succeeded',
  'failed',
  'superseded',
  'cancelled',
  'unknown',
]);

// In-memory store with the same semantics as the SQLite store, for tests.
export class MemoryStore implements EnvironmentStore {
  meta: EnvironmentMeta = defaultMeta(0);
  lanes = new Map<string, Lane>();
  deployments = new Map<string, Deployment>();
  budget = new Map<string, number>();
  seq = 0;

  readMeta() {
    return structuredClone(this.meta);
  }
  writeMeta(meta: EnvironmentMeta) {
    this.meta = structuredClone(meta);
  }
  readLane(lane: string) {
    const value = this.lanes.get(lane);
    return value ? structuredClone(value) : null;
  }
  writeLane(lane: Lane) {
    this.lanes.set(lane.lane, structuredClone(lane));
  }
  listLanes() {
    return (
      [...this.lanes.values()]
        .map((lane) => structuredClone(lane))
        // Binary order on ties, like SQLite's default collation.
        .sort(
          (a, b) =>
            b.updatedAt - a.updatedAt ||
            (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : 0)
        )
    );
  }
  readDeployment(id: string) {
    const value = this.deployments.get(id);
    return value ? structuredClone(value) : null;
  }
  findByIdempotencyKey(key: string) {
    for (const deployment of this.deployments.values())
      if (deployment.idempotencyKey === key) return structuredClone(deployment);
    return null;
  }
  writeDeployment(deployment: Deployment) {
    this.deployments.set(deployment.id, structuredClone(deployment));
  }
  #lane(lane: string) {
    return [...this.deployments.values()].filter((d) => d.lane === lane);
  }
  queued(lane: string) {
    return this.#lane(lane)
      .filter((d) => d.status === 'queued')
      .sort((a, b) => a.seq - b.seq)
      .map((d) => structuredClone(d));
  }
  recent(lane: string, limit: number) {
    return this.#lane(lane)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, limit)
      .map((d) => structuredClone(d));
  }
  publishing() {
    return [...this.deployments.values()]
      .filter((d) => d.status === 'publishing')
      .map((d) => structuredClone(d));
  }
  queuedBefore(cutoff: number) {
    return [...this.deployments.values()]
      .filter((d) => d.status === 'queued' && d.createdAt < cutoff)
      .map((d) => structuredClone(d));
  }
  current(lane: string) {
    const [latest] = this.#lane(lane)
      .filter((d) => d.status === 'succeeded')
      .sort((a, b) => (b.attempt?.epoch ?? 0) - (a.attempt?.epoch ?? 0));
    return latest ? structuredClone(latest) : null;
  }
  maxDeployRunId(lane: string) {
    let max: number | null = null;
    for (const d of this.#lane(lane))
      if (
        d.kind === 'deploy' &&
        d.runId !== null &&
        ['queued', 'publishing', 'succeeded'].includes(d.status) &&
        (max === null || d.runId > max)
      )
        max = d.runId;
    return max;
  }
  nextSeq() {
    this.seq += 1;
    return this.seq;
  }
  openLaneCount() {
    const lanes = new Set<string>();
    for (const d of this.deployments.values())
      if (OPEN.has(d.status)) lanes.add(d.lane);
    return lanes.size;
  }
  pruneTerminal(
    lane: string,
    keep: number,
    protectId: string | null,
    unknownSince: number
  ) {
    const terminal = this.#lane(lane)
      .filter(
        (d) =>
          TERMINAL_PRUNABLE.has(d.status) &&
          d.id !== protectId &&
          !(d.status === 'unknown' && (d.finishedAt ?? 0) >= unknownSince)
      )
      .sort((a, b) => b.seq - a.seq);
    for (const d of terminal.slice(keep)) this.deployments.delete(d.id);
  }
  hasUnknownSince(lane: string, cutoff: number) {
    return this.#lane(lane).some(
      (d) => d.status === 'unknown' && (d.finishedAt ?? 0) >= cutoff
    );
  }
  deleteLane(lane: string) {
    this.lanes.delete(lane);
    for (const d of this.#lane(lane)) this.deployments.delete(d.id);
  }
  countRequest(day: string, limit: number, force: boolean) {
    const used = this.budget.get(day) ?? 0;
    if (used >= limit && !force) return null;
    const next = used + 1;
    this.budget.clear();
    this.budget.set(day, next);
    return next;
  }
}
