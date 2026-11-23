import {
  type BoardRoomMeta,
  boardFlushFenced,
  emptyMeta,
  needsFlush,
  needsPersist,
  nextAlarmAt,
  recordEdit,
  recordFlushed,
  recordIdle,
  reserveFlushAttempt,
} from './board-sync-flush';
import {
  type BoardCheckpointBody,
  type BoardCheckpointResult,
  BOARD_LIMITS,
  type BoardChange,
  type BoardElement,
  type BoardServerMessage,
} from './board-sync-schema';
import { isTerminalCheckpointStatus } from './board-sync-access';
import {
  applyBoardChanges,
  canonicalScene,
  mergeElements,
  pruneTombstones,
  type BoardScene,
  sceneElements,
  sceneFrom,
} from './board-sync-merge';

/** Everything the room needs from its host, so the core runs anywhere. */
export interface BoardRoomDeps {
  now(): number;
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(entries: Record<string, unknown>): Promise<void>;
    setAlarm(at: number): Promise<void>;
  };
  /** Reads the stored scene from the platform. */
  load(): Promise<BoardCheckpointResult>;
  /** Writes a scene; a network failure throws, anything the platform answers returns. */
  flush(
    body: BoardCheckpointBody
  ): Promise<{ status: number; result?: BoardCheckpointResult }>;
  hash(text: string): Promise<string>;
  broadcast(message: BoardServerMessage): void;
  connections(): number;
  /** Closes sockets whose ticket expired. */
  closeExpired(): void;
  closeAll(): void;
  /** The raw stop-fence switch (`MEET_WHITEBOARD_FLUSH_DISABLED`). */
  fenceValue(): string | undefined;
}

const SCENE = 'scene';
const META = 'meta';

/**
 * One persistent board: the merged scene, when it reaches Durable Object
 * storage and when it reaches the database. Every write is driven by one alarm
 * that coalesces edits into at most one storage write per persist window and
 * one database flush per flush window, so cost depends on time, not edits.
 */
export function createBoardRoom(deps: BoardRoomDeps) {
  let scene: BoardScene = new Map();
  let meta: BoardRoomMeta = emptyMeta();
  let sweepDueAt: number | null = null;
  let armedAt: number | null = null;
  let loaded = false;
  let flushing: Promise<void> | null = null;

  const fenced = () => boardFlushFenced(deps.fenceValue());

  async function reschedule() {
    const next = nextAlarmAt({
      meta,
      now: deps.now(),
      fenced: fenced(),
      connected: deps.connections() > 0,
      sweepDueAt,
    });
    if (next === null || (armedAt !== null && armedAt <= next)) return;
    armedAt = next;
    await deps.storage.setAlarm(next);
  }

  async function persist() {
    meta = {
      ...meta,
      persistedRevision: meta.revision,
      persistDueAt: null,
    };
    await deps.storage.put({ [SCENE]: sceneElements(scene), [META]: meta });
  }

  async function runFlush() {
    const reservation = reserveFlushAttempt(meta, deps.now());
    if (!reservation || 'wait' in reservation) {
      if (needsPersist(meta)) await persist();
      return;
    }
    meta = reservation.meta;
    // The reservation and the scene are durable before any network I/O.
    await persist();
    const revision = meta.revision;
    const elements = sceneElements(scene);
    const body: BoardCheckpointBody = {
      op: 'flush',
      elements: elements as BoardCheckpointBody['elements'],
      revision,
      baseUpdatedAt: meta.baseUpdatedAt,
      hash: await deps.hash(canonicalScene(elements)),
    };
    let answer: Awaited<ReturnType<BoardRoomDeps['flush']>>;
    try {
      answer = await deps.flush(body);
    } catch {
      deps.broadcast({ type: 'save-error' });
      return;
    }
    if (answer.status === 200 && answer.result) {
      meta = recordFlushed(meta, revision, answer.result.updatedAt, deps.now());
      await deps.storage.put({ [META]: meta });
      deps.broadcast({ type: 'saved', revision });
      return;
    }
    if (answer.status === 409 && answer.result?.elements) {
      // Someone else saved the board. Merge their scene, then flush the union.
      const remote = answer.result.elements as BoardElement[];
      const applied = mergeElements(scene, remote);
      if (applied.length > 0)
        deps.broadcast({
          type: 'elements',
          senderId: 'system',
          changes: applied.map((element) => ({ type: 'update', element })),
          timestamp: deps.now(),
        });
      const converged =
        (await deps.hash(canonicalScene(sceneElements(scene)))) ===
        (await deps.hash(canonicalScene(remote)));
      meta = { ...meta, baseUpdatedAt: answer.result.updatedAt };
      meta = converged
        ? recordFlushed(
            meta,
            meta.revision,
            answer.result.updatedAt,
            deps.now()
          )
        : {
            ...meta,
            revision: meta.revision + 1,
            flushDueAt: deps.now() + BOARD_LIMITS.flushWindowMs,
          };
      await deps.storage.put({ [SCENE]: sceneElements(scene), [META]: meta });
      return;
    }
    if (isTerminalCheckpointStatus(answer.status)) {
      meta = { ...meta, closed: true, flushDueAt: null };
      await deps.storage.put({ [META]: meta });
      deps.broadcast({ type: 'closed' });
      deps.closeAll();
      return;
    }
    deps.broadcast({ type: 'save-error' });
  }

  return {
    /** Restores storage on construction; re-arms an alarm for unfinished work. */
    async restore() {
      const [elements, stored] = await Promise.all([
        deps.storage.get<BoardElement[]>(SCENE),
        deps.storage.get<BoardRoomMeta>(META),
      ]);
      if (stored) {
        meta = stored;
        scene = sceneFrom(elements ?? []);
        loaded = true;
      }
      await reschedule();
    },
    /** The scene must come from the database before the first participant edits. */
    async ensureLoaded() {
      if (loaded) return;
      const result = await deps.load();
      scene = sceneFrom((result.elements ?? []) as BoardElement[]);
      meta = { ...emptyMeta(), baseUpdatedAt: result.updatedAt };
      loaded = true;
      if (!fenced())
        await deps.storage.put({ [SCENE]: sceneElements(scene), [META]: meta });
    },
    get closed() {
      return !!meta.closed;
    },
    elements: () => sceneElements(scene),
    snapshotMeta: () => meta,
    /** Applies an accepted batch; returns what actually changed, for relay. */
    async edit(changes: readonly BoardChange[]) {
      const applied = applyBoardChanges(scene, changes);
      if (applied.length === 0) return applied;
      pruneTombstones(scene);
      meta = recordEdit(meta, deps.now());
      await reschedule();
      return applied;
    },
    async connectionsChanged() {
      const now = deps.now();
      if (deps.connections() === 0) {
        sweepDueAt = null;
        meta = recordIdle(meta, now);
      } else if (sweepDueAt === null) {
        sweepDueAt = now + BOARD_LIMITS.sweepMs;
      }
      await reschedule();
    },
    async alarm() {
      armedAt = null;
      const now = deps.now();
      if (sweepDueAt !== null && sweepDueAt <= now) {
        deps.closeExpired();
        sweepDueAt = deps.connections() > 0 ? now + BOARD_LIMITS.sweepMs : null;
      }
      if (!fenced() && !meta.closed) {
        if (
          needsFlush(meta) &&
          meta.flushDueAt !== null &&
          meta.flushDueAt <= now
        ) {
          flushing ??= runFlush().finally(() => {
            flushing = null;
          });
          await flushing;
        } else if (
          needsPersist(meta) &&
          meta.persistDueAt !== null &&
          meta.persistDueAt <= now
        )
          await persist();
      }
      await reschedule();
    },
  };
}
export type BoardRoom = ReturnType<typeof createBoardRoom>;
