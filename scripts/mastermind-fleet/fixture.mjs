// Synthetic T3 state database for the fleet publisher tests.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

export function fixtureDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE orchestration_v2_projection_threads (
      thread_id TEXT PRIMARY KEY, project_id TEXT, title TEXT, updated_at TEXT,
      archived_at TEXT, deleted_at TEXT, payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runs (
      run_id TEXT PRIMARY KEY, thread_id TEXT, ordinal INTEGER, provider TEXT,
      status TEXT, requested_at TEXT, completed_at TEXT, payload_json TEXT);
    CREATE TABLE projection_projects (project_id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE peer_environment_links (
      environment_id TEXT PRIMARY KEY, label TEXT, last_reached_at TEXT,
      secret_name TEXT, urls_json TEXT NOT NULL DEFAULT '[]',
      linked_at TEXT NOT NULL DEFAULT '', expires_at TEXT,
      fenced INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE orchestration_v2_projection_messages (thread_id TEXT, text TEXT);
  `);
  db.prepare('INSERT INTO projection_projects VALUES (?, ?)').run(
    'p1',
    'tuturuuu'
  );
  const thread = db.prepare(
    'INSERT INTO orchestration_v2_projection_threads VALUES (?, ?, ?, ?, ?, NULL, ?)'
  );
  const payload = (model, parent) =>
    JSON.stringify({
      modelSelection: { model },
      ...(parent ? { lineage: { parentThreadId: parent } } : {}),
    });
  thread.run(
    't-iris',
    'p1',
    '[Iris] Orchestrator',
    '2026-11-20T02:59:00.000Z',
    null,
    payload('claude-opus')
  );
  thread.run(
    't-run',
    'p1',
    'Mobile sync see https://x.example/a',
    '2026-11-20T02:58:00.000Z',
    null,
    payload('gpt-6', 't-iris')
  );
  thread.run(
    't-fail',
    'p1',
    'CI fix',
    '2026-11-20T01:00:00.000Z',
    null,
    payload('gpt-6')
  );
  thread.run(
    't-old',
    'p1',
    'Old lane',
    '2026-11-10T01:00:00.000Z',
    null,
    payload('gpt-6')
  );
  thread.run(
    't-arch',
    'p1',
    'Archived',
    '2026-11-20T02:00:00.000Z',
    '2026-11-20T02:30:00.000Z',
    payload('gpt-6')
  );
  const run = db.prepare(
    'INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  run.run(
    'r1',
    't-iris',
    1,
    'claude',
    'completed',
    '2026-11-20T02:50:00.000Z',
    '2026-11-20T02:59:00.000Z',
    '{}'
  );
  run.run(
    'r2',
    't-iris',
    2,
    'claude',
    'running',
    '2026-11-20T02:59:30.000Z',
    null,
    '{}'
  );
  run.run(
    'r3',
    't-run',
    1,
    'codex',
    'running',
    '2026-11-20T02:40:00.000Z',
    null,
    '{}'
  );
  run.run(
    'r4',
    't-run',
    2,
    'codex',
    'queued',
    '2026-11-20T02:41:00.000Z',
    null,
    '{}'
  );
  run.run(
    'r5',
    't-fail',
    1,
    'codex',
    'failed',
    '2026-11-20T00:30:00.000Z',
    '2026-11-20T01:00:00.000Z',
    '{}'
  );
  run.run(
    'r6',
    't-old',
    1,
    'codex',
    'completed',
    '2026-11-10T00:30:00.000Z',
    '2026-11-10T01:00:00.000Z',
    '{}'
  );
  run.run(
    'r7',
    't-arch',
    1,
    'codex',
    'running',
    '2026-11-20T02:00:00.000Z',
    null,
    '{}'
  );
  db.prepare(
    "INSERT INTO peer_environment_links (environment_id, label, last_reached_at, secret_name, urls_json, linked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, '2026-12-20T00:00:00.000Z')"
  ).run(
    'env-1',
    'MacStudio1',
    '2026-11-20T02:55:00.000Z',
    'peer-link-kept-out',
    '["https://relay.example.test"]',
    '2026-11-09T00:00:00.000Z'
  );
  db.prepare(
    "INSERT INTO peer_environment_links (environment_id, label, last_reached_at, secret_name, urls_json, linked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, '2026-12-20T00:00:00.000Z')"
  ).run(
    'env-2',
    'Old laptop',
    '2026-11-18T02:55:00.000Z',
    'kept-out',
    '[]',
    '2026-11-10T00:00:00.000Z'
  );
  db.prepare(
    'INSERT INTO orchestration_v2_projection_messages VALUES (?, ?)'
  ).run('t-run', 'PRIVATE CHAT BODY');
  return db;
}

/** A fake T3 peer speaking MCP streamable HTTP, keyed by origin. */
export function fakePeers(byOrigin) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const { origin } = new URL(url);
    const peer = byOrigin[origin];
    calls.push({
      origin,
      method: init.method,
      auth: init.headers.authorization,
    });
    assert.equal(init.redirect, 'error');
    if (!peer || peer.down) throw new Error('unreachable');
    if (new URL(url).pathname === '/.well-known/t3/environment') {
      assert.equal(init.headers.authorization, undefined);
      return Response.json({ environmentId: peer.environmentId });
    }
    if (init.headers.authorization !== `Bearer ${peer.token}`)
      return new Response('{}', { status: 401 });
    if (init.method === 'DELETE') {
      peer.closed = (peer.closed ?? 0) + 1;
      return new Response(null, { status: 204 });
    }
    const message = JSON.parse(init.body);
    if (message.id === undefined) return new Response(null, { status: 202 });
    let result = { protocolVersion: '2025-06-18', capabilities: {} };
    if (message.method === 'tools/call') {
      const { name, arguments: args } = message.params;
      const payload =
        name === 't3_project_list'
          ? { projects: peer.projects ?? [], nextCursor: null }
          : peer.list(args);
      result = { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
    const body = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
    return new Response(peer.sse ? `event: message\ndata: ${body}\n\n` : body, {
      headers: {
        'content-type': peer.sse ? 'text/event-stream' : 'application/json',
        'mcp-session-id': 'session-1',
      },
    });
  };
  return { calls, fetchImpl };
}

/** Answers t3_thread_list like T3: status filter, newest first, paged. */
export function threadLister(threads) {
  return (args) => {
    const matching = threads
      .filter((t) => !args.statuses || args.statuses.includes(t.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = args.cursor ?? 0;
    const end = start + (args.limit ?? 20);
    return {
      threads: matching.slice(start, end),
      nextCursor: end < matching.length ? end : null,
      total: matching.length,
    };
  };
}
