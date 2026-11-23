import { isTerminalCheckpointStatus } from './board-sync-access';
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
  type BoardScene,
  applyBoundedChanges,
  canonicalScene,
  chunkElements,
  mergeElements,
  pruneTombstones,
  sceneElements,
  sceneFrom,
  sizesFrom,
  tombstone,
} from './board-sync-merge';
import {
  BOARD_LIMITS,
  type BoardChange,
  type BoardCheckpointBody,
  type BoardCheckpointResult,
  type BoardElement,
  type BoardServerMessage,
  byteLength,
} from './board-sync-schema';

/** Everything the room needs from its host, so the core runs anywhere. */
export interface BoardRoomDeps {
  now(): number;
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(entries: Record<string, unknown>): Promise<void>;
    delete(keys: string[]): Promise<void>;
    setAlarm(at: number): Promise<void>;
  };
  /** Reads the stored scene from the platform; a network failure throws. */
  load(): Promise<{ status: number; result?: BoardCheckpointResult }>;
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

/** The platform refused or could not serve the board; `status` is its answer. */
export class BoardLoadError extends Error {
  constructor(readonly status: number) {
    super('Board load failed');
  }
}

const SCENE = 'scene';
const META = 'meta';
const chunkKey = (index: number) => `${SCENE}:${index}`;
const versionOf = (element: BoardElement) =>
  `${element.version}:${element.versionNonce}`;

/**
 * One persistent board: the merged scene, when it reaches Durable Object
 * storage and when it reaches the database. Every write is driven by one alarm
 * that coalesces edits into at most one storage write per persist window and
 * one database flush per flush window, so cost depends on time, not edits.
 * The scene is bounded in elements and bytes and is stored in chunks, so no
 * single storage value approaches the platform limit.
 */
export function createBoardRoom(deps: BoardRoomDeps) {
  let scene: BoardScene = new Map();
  let tracker = sizesFrom(scene);
  let dirty = new Set<string>();
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

  /** Writes the scene in chunks and the meta; marks the revision persisted only once the write resolved. */
  async function persist() {
    const revision = meta.revision;
    const chunks = chunkElements(sceneElements(scene));
    const previous = meta.sceneChunks ?? 0;
    const entries: Record<string, unknown> = {
      [META]: {
        ...meta,
        persistedRevision: revision,
        persistDueAt: null,
        sceneChunks: chunks.length,
        dirtyIds: [...dirty],
      } satisfies BoardRoomMeta,
    };
    chunks.forEach((chunk, index) => {
      entries[chunkKey(index)] = chunk;
    });
    await deps.storage.put(entries);
    meta = {
      ...meta,
      persistedRevision: revision,
      sceneChunks: chunks.length,
      // Edits that arrived during the write keep their own persist window.
      persistDueAt:
        meta.revision > revision
          ? deps.now() + BOARD_LIMITS.persistWindowMs
          : null,
    };
    if (previous > chunks.length)
      await deps.storage
        .delete(
          Array.from({ length: previous - chunks.length }, (_, i) =>
            chunkKey(chunks.length + i)
          )
        )
        .catch(() => undefined);
  }

  /** A failed write gives up until the next edit re-arms the window; it never spins. */
  async function safePersist() {
    try {
      await persist();
      return true;
    } catch {
      meta = { ...meta, persistDueAt: null };
      return false;
    }
  }

  async function putMeta() {
    await deps.storage.put({ [META]: { ...meta, dirtyIds: [...dirty] } });
  }

  function replaceScene(elements: BoardElement[]) {
    scene = sceneFrom(elements);
    tracker = sizesFrom(scene);
  }

  /** Loads the board from the platform and adopts it as the room's state. */
  async function adopt(guard?: () => boolean) {
    const answer = await deps.load();
    if (guard && !guard()) return 'skipped' as const;
    if (answer.status === 200 && answer.result) {
      const elements = (answer.result.elements ?? []) as BoardElement[];
      if (byteLength(elements) > BOARD_LIMITS.maxSnapshotBytes)
        throw new BoardLoadError(413);
      replaceScene(elements);
      dirty = new Set();
      meta = { ...emptyMeta(), baseUpdatedAt: answer.result.updatedAt };
      loaded = true;
      if (!fenced()) await persist();
      return 'loaded' as const;
    }
    if (loaded && isTerminalCheckpointStatus(answer.status)) {
      meta = { ...meta, closed: true, flushDueAt: null };
      return 'closed' as const;
    }
    throw new BoardLoadError(answer.status);
  }

  async function runFlush() {
    const reservation = reserveFlushAttempt(meta, deps.now());
    if (!reservation || 'wait' in reservation) {
      if (needsPersist(meta)) await safePersist();
      return;
    }
    meta = reservation.meta;
    // The reservation and the scene are durable before any network I/O.
    if (!(await safePersist())) {
      deps.broadcast({ type: 'save-error' });
      return;
    }
    const revision = meta.revision;
    const elements = sceneElements(scene);
    const flushed = new Map(elements.map((e) => [e.id, versionOf(e)]));
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
      for (const id of [...dirty]) {
        const current = scene.get(id);
        if (!current || flushed.get(id) === versionOf(current))
          dirty.delete(id);
      }
      meta = recordFlushed(meta, revision, answer.result.updatedAt, deps.now());
      await putMeta();
      deps.broadcast({ type: 'saved', revision });
      return;
    }
    if (answer.status === 409 && answer.result?.elements) {
      await mergeConcurrentSave(
        answer.result.elements as BoardElement[],
        answer.result.updatedAt
      );
      return;
    }
    if (isTerminalCheckpointStatus(answer.status)) {
      meta = { ...meta, closed: true, flushDueAt: null };
      await putMeta();
      deps.broadcast({ type: 'closed' });
      deps.closeAll();
      return;
    }
    deps.broadcast({ type: 'save-error' });
  }

  /**
   * Someone else saved the board. Their scene wins for anything this room did
   * not edit since its last flush: an element missing from it was deleted there
   * and stays deleted. Everything else merges by version, then the union is
   * flushed once.
   */
  async function mergeConcurrentSave(
    remote: BoardElement[],
    updatedAt: string
  ) {
    const remoteIds = new Set(remote.map((element) => element.id));
    const changes: BoardChange[] = [];
    for (const [id, element] of scene)
      if (!remoteIds.has(id) && !dirty.has(id) && !element.isDeleted) {
        const removed = tombstone(element);
        scene.set(id, removed);
        changes.push({ type: 'update', element: removed });
      }
    for (const element of mergeElements(scene, remote))
      changes.push({ type: 'update', element });
    tracker = sizesFrom(scene);
    if (changes.length > 0)
      deps.broadcast({
        type: 'elements',
        senderId: 'system',
        changes,
        timestamp: deps.now(),
      });
    const live = sceneElements(scene).filter((element) => !element.isDeleted);
    const remoteLive = remote.filter((element) => !element.isDeleted);
    const converged =
      (await deps.hash(canonicalScene(live))) ===
      (await deps.hash(canonicalScene(remoteLive)));
    meta = { ...meta, baseUpdatedAt: updatedAt };
    if (converged) {
      dirty = new Set();
      meta = recordFlushed(meta, meta.revision, updatedAt, deps.now());
    } else {
      meta = {
        ...meta,
        revision: meta.revision + 1,
        flushDueAt: deps.now() + BOARD_LIMITS.flushWindowMs,
      };
    }
    await persist();
  }

  return {
    /** Restores storage on construction; re-arms the alarm for unfinished work and for open sockets. */
    async restore() {
      const stored = await deps.storage.get<BoardRoomMeta>(META);
      if (stored) {
        const chunks = await Promise.all(
          Array.from({ length: stored.sceneChunks ?? 0 }, (_, i) =>
            deps.storage.get<BoardElement[]>(chunkKey(i))
          )
        );
        meta = stored;
        replaceScene(chunks.flatMap((chunk) => chunk ?? []));
        dirty = new Set(stored.dirtyIds ?? []);
        loaded = true;
      }
      // Sockets survive eviction but the sweep timer does not: sweep now.
      if (deps.connections() > 0) sweepDueAt = deps.now();
      await reschedule();
    },
    /**
     * Gets the room ready for a joiner. The first load comes from the database.
     * A room with nobody connected and nothing unflushed reloads, so edits made
     * elsewhere in between are never overwritten; a closed room reloads and
     * reopens if the board is available again.
     */
    async prepare() {
      if (!loaded) {
        await adopt();
        return;
      }
      if (meta.closed || (deps.connections() === 0 && !needsFlush(meta)))
        await adopt(
          () => !!meta.closed || (deps.connections() === 0 && !needsFlush(meta))
        );
    },
    get closed() {
      return !!meta.closed;
    },
    elements: () => sceneElements(scene),
    snapshotMeta: () => meta,
    /** Applies an accepted batch; returns what changed, for relay, and what was refused. */
    async edit(changes: readonly BoardChange[]) {
      const { applied, rejected } = applyBoundedChanges(
        scene,
        tracker,
        changes
      );
      if (applied.length === 0) return { applied, rejected };
      for (const { element } of applied) dirty.add(element.id);
      pruneTombstones(scene, tracker);
      meta = recordEdit(meta, deps.now());
      await reschedule();
      return { applied, rejected };
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
      if (sweepDueAt === null && deps.connections() > 0) sweepDueAt = now;
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
          await safePersist();
      }
      await reschedule();
    },
  };
}
export type BoardRoom = ReturnType<typeof createBoardRoom>;
