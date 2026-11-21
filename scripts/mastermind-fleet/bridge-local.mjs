// Local reads for the Mastermind fleet bridge, straight from T3's own
// projection database, opened read-only like the publisher does. T3's MCP
// list tool takes seconds on a machine with ten thousand threads; these
// queries take milliseconds, so the owner's list, search and history feel
// instant for the machine the bridge runs on. Linked machines are still read
// through the T3 MCP tools (bridge-rpc.mjs).
import { fleetText } from './scrub.mjs';

const TITLE_MAX = 120;
const ENVIRONMENT_ID = /^\w[\w-]{0,99}$/;
const RUNNING = new Set(['preparing', 'queued', 'starting', 'running']);

/** T3's run status as one of the four states the owner sees. */
export function threadState(status) {
  if (RUNNING.has(status)) return 'running';
  if (status === 'waiting') return 'waiting';
  if (status === 'failed') return 'failed';
  return 'idle';
}

/** The newest run's status: what decides a thread's state. */
const STATUS_SQL = `(SELECT r.status FROM orchestration_v2_projection_runs r
         WHERE r.thread_id = t.thread_id
         ORDER BY r.ordinal DESC LIMIT 1)`;
/** `threadState` in SQL, built from the same list so the two cannot drift. */
const STATE_SQL = `CASE ${STATUS_SQL} ${[...RUNNING]
  .map((status) => `WHEN '${status}' THEN 'running'`)
  .join(' ')}
       WHEN 'waiting' THEN 'waiting' WHEN 'failed' THEN 'failed'
       ELSE 'idle' END`;
const THREAD_COLUMNS = `t.thread_id, t.title, t.project_id, t.updated_at,
       p.title AS project_title, c.item_count, ${STATUS_SQL} AS status
  FROM orchestration_v2_projection_threads t
  LEFT JOIN projection_projects p ON p.project_id = t.project_id
  LEFT JOIN orchestration_v2_projection_thread_item_counts c
         ON c.thread_id = t.thread_id`;
const LIVE = 't.deleted_at IS NULL AND t.archived_at IS NULL';

/** The `projectId` that asks for threads in no project. */
export const NO_PROJECT = 'none';
export const PROJECTS_MAX = 200;
/** How far back in a thread the owner's last message is looked for. */
const OWNER_REPLY_SCAN = 400;
// A message the owner wrote in T3: typed, or given as the answer to a
// question a thread asked. Every other `user` message was written by an agent
// or by T3 itself (a scheduled task, a notification, a delegated result, the
// prompt T3 sends to resume a run after a usage limit) or came in with
// imported history, which is not the owner being active here.
const OWNER_REPLY_SQL = `SELECT max(at) AS at FROM (
    SELECT m.updated_at AS at, m.message_id, m.payload_json
      FROM orchestration_v2_projection_messages m
     WHERE m.thread_id = ? AND m.role = 'user'
     ORDER BY m.updated_at DESC LIMIT ${OWNER_REPLY_SCAN})
   WHERE CASE WHEN json_valid(payload_json) THEN
           json_extract(payload_json, '$.createdBy') = 'user'
           AND json_extract(payload_json, '$.scheduledTaskId') IS NULL
           AND json_extract(payload_json, '$.notification') IS NULL
           AND json_extract(payload_json, '$.delegatedCompletion') IS NULL
           AND message_id NOT GLOB 'limit-resume:*'
           AND message_id NOT GLOB 'import:*'
         END`;
const COUNT_COLUMNS = `count(*) AS n,
       sum(state = 'running') AS running, sum(state = 'waiting') AS waiting,
       sum(state = 'failed') AS failed, sum(state = 'idle') AS idle`;
const STATED_THREADS = `SELECT t.project_id AS project_id,
       t.updated_at AS updated_at, ${STATE_SQL} AS state
  FROM orchestration_v2_projection_threads t WHERE ${LIVE}`;
/** T3 keeps one scratch project; more than a few means a schema not known here. */
const SCRATCH_PROJECTS_MAX = 8;

/**
 * Throws unless `table` has an index that starts with `columns` and covers
 * every row the lookup reads: a full index, or a partial one whose own
 * condition is `servedCondition`. The reads that look up rows per thread take
 * milliseconds with it and minutes without, and a statement cannot be
 * interrupted once it runs.
 */
function requireIndex(db, table, columns, servedCondition) {
  const indexes = db
    .prepare('SELECT name, partial FROM pragma_index_list(?)')
    .all(table);
  for (const { name, partial } of indexes) {
    const leading = db
      .prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno')
      .all(name)
      .map((column) => column.name);
    if (!columns.every((column, at) => leading[at] === column)) continue;
    if (!partial) return;
    const definition = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?"
      )
      .get(name);
    if (servedCondition?.test(String(definition?.sql ?? ''))) return;
  }
  throw new Error(`No index on ${table} (${columns.join(', ')})`);
}
const requireRunIndex = (db) =>
  requireIndex(db, 'orchestration_v2_projection_runs', [
    'thread_id',
    'ordinal',
  ]);
/** The owner-reply lookup reads `user` rows only, so an index of those serves it. */
const USER_ROWS_ONLY = /\bWHERE\s+role\s*=\s*'user'\s*$/i;

const count = (value) => (Number.isSafeInteger(value) ? value : 0);
const countsView = (row) => ({
  threadCount: count(row?.n),
  counts: {
    running: count(row?.running),
    waiting: count(row?.waiting),
    failed: count(row?.failed),
    idle: count(row?.idle),
  },
});

/** A thread in T3's scratch project is in no project: it carries none. */
function threadView(row, scratch) {
  const assigned =
    typeof row.project_id === 'string' && !scratch.includes(row.project_id);
  const project = assigned
    ? fleetText(String(row.project_title ?? ''), 80)
    : '';
  return {
    threadId: row.thread_id,
    title: fleetText(String(row.title ?? ''), TITLE_MAX) || 'Untitled',
    ...(assigned ? { projectId: row.project_id.slice(0, 400) } : {}),
    ...(project ? { project } : {}),
    state: threadState(row.status),
    updatedAt: String(row.updated_at ?? '').slice(0, 40),
    itemCount: Number.isSafeInteger(row.item_count) ? row.item_count : 0,
  };
}

/** `%` and `_` in a search are literal characters, not wildcards. */
const likePattern = (query) =>
  `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Reads over an open read-only database. `scrub(text)` returns
 * `{ text, truncated }` for one message; the caller supplies it so the
 * redaction rules live in one place. `scratchRoot` is the folder of T3's
 * scratch project, which holds the threads that belong to no project.
 * `bridgeReplyAt(threadId)` is when the owner last replied to a thread
 * through the bridge, from its own ledger of delivered replies.
 */
export function localReads(
  db,
  { scrub, now = Date.now, scratchRoot, bridgeReplyAt }
) {
  let scratchIds;
  /** The ids of T3's scratch project; empty when this machine has none. */
  const scratch = () => {
    if (scratchIds) return scratchIds;
    const rows = scratchRoot
      ? db
          .prepare(
            `SELECT project_id FROM projection_projects
              WHERE workspace_root = ? LIMIT ${SCRATCH_PROJECTS_MAX + 1}`
          )
          .all(scratchRoot)
      : [];
    if (rows.length > SCRATCH_PROJECTS_MAX)
      throw new Error('Too many scratch projects');
    scratchIds = rows.map((row) => String(row.project_id));
    return scratchIds;
  };
  /** `column IN (scratch ids)` as SQL, with its values. */
  const inScratch = (column) =>
    scratch().length > 0
      ? `${column} IN (${scratch()
          .map(() => '?')
          .join(', ')})`
      : '0';

  return {
    machines() {
      const links = db
        .prepare(
          `SELECT environment_id, label, expires_at
             FROM peer_environment_links ORDER BY linked_at, environment_id`
        )
        .all();
      return {
        machines: [
          { label: 'This machine', reachable: true },
          ...links
            .filter((link) => ENVIRONMENT_ID.test(String(link.environment_id)))
            .slice(0, 31)
            .map((link) => ({
              environmentId: link.environment_id,
              label: fleetText(String(link.label ?? ''), 80) || 'Machine',
              // Whether it answers right now is T3's to say; this is only
              // whether the link has not expired.
              reachable: !(Date.parse(link.expires_at ?? '') <= now()),
            })),
        ],
      };
    },

    /**
     * One page of threads, newest first. `projectId` keeps one project's
     * threads (`NO_PROJECT` for those in none), `state` one state, and
     * `ownerReply` adds when the owner last wrote in each listed thread.
     */
    threads({ query, cursor = 0, limit = 50, projectId, state, ownerReply }) {
      const clauses = [LIVE];
      const filter = [];
      if (query) {
        clauses.push(`t.title LIKE ? ESCAPE '\\'`);
        filter.push(likePattern(query));
      }
      if (projectId === NO_PROJECT) {
        clauses.push(inScratch('t.project_id'));
        filter.push(...scratch());
      } else if (projectId) {
        clauses.push('t.project_id = ?');
        filter.push(projectId);
      }
      if (state) {
        requireRunIndex(db);
        clauses.push(`${STATE_SQL} = ?`);
        filter.push(state);
      }
      const where = clauses.join(' AND ');
      const rows = db
        .prepare(
          `SELECT ${THREAD_COLUMNS} WHERE ${where}
            ORDER BY t.updated_at DESC, t.thread_id LIMIT ? OFFSET ?`
        )
        .all(...filter, limit, cursor);
      const total = Number(
        db
          .prepare(
            `SELECT count(*) AS n FROM orchestration_v2_projection_threads t
              WHERE ${where}`
          )
          .get(...filter)?.n ?? 0
      );
      if (ownerReply)
        requireIndex(
          db,
          'orchestration_v2_projection_messages',
          ['thread_id', 'updated_at'],
          USER_ROWS_ONLY
        );
      const typed = ownerReply ? db.prepare(OWNER_REPLY_SQL) : null;
      return {
        threads: rows.map((row) => {
          // Both are ISO instants, so the later one sorts last.
          const at = typed
            ? [typed.get(row.thread_id)?.at, bridgeReplyAt?.(row.thread_id)]
                .filter((value) => typeof value === 'string' && value)
                .sort()
                .at(-1)
            : undefined;
          return {
            ...threadView(row, scratch()),
            ...(at ? { lastOwnerReplyAt: at.slice(0, 40) } : {}),
          };
        }),
        nextCursor: cursor + rows.length < total ? cursor + rows.length : null,
        total,
      };
    },

    /**
     * Every project with live threads, the one touched last first, each with
     * its thread count per state; then the same for threads in no project.
     * `total` counts all such projects, so a list cut at `PROJECTS_MAX`
     * shows that it was cut.
     */
    projects() {
      requireRunIndex(db);
      const loose = inScratch('t.project_id');
      const rows = db
        .prepare(
          `SELECT s.project_id, p.title AS project_title,
                  max(s.updated_at) AS latest, ${COUNT_COLUMNS}
             FROM (${STATED_THREADS} AND NOT ${loose}) s
             LEFT JOIN projection_projects p ON p.project_id = s.project_id
            GROUP BY s.project_id
            ORDER BY latest DESC, s.project_id LIMIT ?`
        )
        .all(...scratch(), PROJECTS_MAX);
      const total = db
        .prepare(
          `SELECT count(DISTINCT t.project_id) AS n
             FROM orchestration_v2_projection_threads t
            WHERE ${LIVE} AND NOT ${loose}`
        )
        .get(...scratch());
      const unassigned = db
        .prepare(
          `SELECT ${COUNT_COLUMNS} FROM (${STATED_THREADS} AND ${loose}) s`
        )
        .get(...scratch());
      return {
        projects: rows.map((row) => ({
          projectId: String(row.project_id).slice(0, 400),
          project: fleetText(String(row.project_title ?? ''), 80) || 'Untitled',
          ...countsView(row),
          latestUpdatedAt: String(row.latest ?? '').slice(0, 40),
        })),
        unassigned: countsView(unassigned),
        total: count(total?.n),
      };
    },

    /** Null when the thread does not exist here (deleted, archived or never did). */
    transcript({ threadId, before, limit = 30 }) {
      const thread = db
        .prepare(`SELECT ${THREAD_COLUMNS} WHERE ${LIVE} AND t.thread_id = ?`)
        .get(threadId);
      if (!thread) return null;
      // One more than asked for tells whether an earlier page exists.
      const rows = db
        .prepare(
          `SELECT rowid AS position, role, payload_json, updated_at
             FROM orchestration_v2_projection_messages
            WHERE thread_id = ? AND role IN ('user', 'assistant')
              AND rowid < ?
            ORDER BY rowid DESC LIMIT ?`
        )
        .all(threadId, before ?? Number.MAX_SAFE_INTEGER, limit + 1);
      const page = rows.slice(0, limit).reverse();
      const messages = [];
      for (const row of page) {
        let text = '';
        try {
          text = String(JSON.parse(row.payload_json)?.text ?? '');
        } catch {
          // A row T3 is still writing: leave it out.
        }
        if (!text.trim()) continue;
        const scrubbed = scrub(text);
        messages.push({
          position: row.position,
          role: row.role,
          text: scrubbed.text,
          truncated: scrubbed.truncated,
          at: String(row.updated_at ?? '').slice(0, 40),
        });
      }
      return {
        thread: threadView(thread, scratch()),
        messages,
        earlierPosition:
          rows.length > limit && page.length > 0 ? page[0].position : null,
      };
    },
  };
}
