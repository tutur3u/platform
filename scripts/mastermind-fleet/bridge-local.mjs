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

const THREAD_COLUMNS = `t.thread_id, t.title, t.project_id, t.updated_at,
       p.title AS project_title, c.item_count,
       (SELECT r.status FROM orchestration_v2_projection_runs r
         WHERE r.thread_id = t.thread_id
         ORDER BY r.ordinal DESC LIMIT 1) AS status
  FROM orchestration_v2_projection_threads t
  LEFT JOIN projection_projects p ON p.project_id = t.project_id
  LEFT JOIN orchestration_v2_projection_thread_item_counts c
         ON c.thread_id = t.thread_id`;
const LIVE = 't.deleted_at IS NULL AND t.archived_at IS NULL';

function threadView(row) {
  const project = fleetText(String(row.project_title ?? ''), 80);
  return {
    threadId: row.thread_id,
    title: fleetText(String(row.title ?? ''), TITLE_MAX) || 'Untitled',
    ...(typeof row.project_id === 'string'
      ? { projectId: row.project_id.slice(0, 400) }
      : {}),
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
 * redaction rules live in one place.
 */
export function localReads(db, { scrub, now = Date.now }) {
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

    threads({ query, cursor = 0, limit = 50 }) {
      const where = query ? `${LIVE} AND t.title LIKE ? ESCAPE '\\'` : LIVE;
      const filter = query ? [likePattern(query)] : [];
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
      return {
        threads: rows.map(threadView),
        nextCursor: cursor + rows.length < total ? cursor + rows.length : null,
        total,
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
        thread: threadView(thread),
        messages,
        earlierPosition:
          rows.length > limit && page.length > 0 ? page[0].position : null,
      };
    },
  };
}
