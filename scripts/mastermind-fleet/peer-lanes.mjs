// Reads each linked T3 environment's threads over the peer link the local T3
// server already holds (`peer_environment_links` plus its 0600 credential in
// the T3 secret store), using the same MCP `t3_thread_list` call T3 agents
// make. No new credential is minted or distributed; the token only ever goes
// to the link's own address, and only metadata (titles, statuses, providers,
// timestamps) is kept. See
// apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync.
import fs from 'node:fs';
import path from 'node:path';

const ACTIVE_GROUPS = [
  ['running', 'preparing', 'starting'],
  ['waiting'],
  ['queued'],
];
const MAX_PEER_LANES = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 100;
const RECENT_PAGES = 20;
const SECRET_NAME = /^peer-link-[a-z0-9-]{1,96}$/i;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Heartbeat windows: a missed probe stays online, then stale, then offline. */
export const PEER_GRACE_MS = 2 * 60 * 1000;
export const PEER_STALE_MS = 30 * 60 * 1000;
/** Whole-peer budget, so every probe finishes inside the 30 s launchd tick. */
export const PEER_DEADLINE_MS = 10_000;
const PEER_CLOSE_MS = 2_000;
const LINK_EXPIRES_AT_HEADER = 't3-link-expires-at';
const DESCRIPTOR_PATH = '/.well-known/t3/environment';

/**
 * Whether `url` answers as `environmentId` on T3's unauthenticated
 * environment descriptor, checked before any credential is sent there.
 */
export async function answersAs(url, environmentId, { fetchImpl, deadline }) {
  try {
    const response = await fetchImpl(new URL(DESCRIPTOR_PATH, url).href, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: signalFor(4_000, deadline),
    });
    if (!response.ok) return false;
    const descriptor = await response.json();
    return descriptor?.environmentId === environmentId;
  } catch {
    return false;
  }
}

/** Tailscale names and its IPv6 range, which T3 also trusts over HTTP. */
function isTailnetHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host.endsWith('.ts.net') || /^fd7a:115c:a1e0(:|$)/.test(host);
}

/**
 * Only HTTPS, or plain HTTP to loopback or the tailnet, may carry a peer
 * credential: the same rule T3 applies to its own link addresses.
 */
export function peerUrlAllowed(value) {
  const url = URL.parse(String(value ?? ''));
  if (!url || url.username || url.password) return false;
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' &&
      (LOOPBACK.has(url.hostname) || isTailnetHost(url.hostname)))
  );
}

/** Maps a T3 thread status onto the fleet lane state. */
export function laneStateFor(status) {
  if (['running', 'preparing', 'starting'].includes(status)) return 'running';
  if (status === 'waiting') return 'waiting';
  if (status === 'queued') return 'queued';
  if (status === 'failed') return 'failed';
  return 'idle';
}

/**
 * Machine status from the live probe and the last time anything reached the
 * peer: online when it answered now (or missed one probe), stale while it has
 * been silent up to PEER_STALE_MS, offline beyond that or once the link expired.
 */
export function classifyPeer({ reachedNow, lastSeenAt, expiresAt }, now) {
  if (expiresAt && Date.parse(expiresAt) <= now.getTime()) return 'offline';
  if (reachedNow) return 'online';
  if (!lastSeenAt) return 'offline';
  const age = now.getTime() - Date.parse(lastSeenAt);
  if (age <= PEER_GRACE_MS) return 'online';
  if (age <= PEER_STALE_MS) return 'stale';
  return 'offline';
}

function latest(...values) {
  return (
    values
      .filter(
        (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))
      )
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? undefined
  );
}

function parseUrls(json) {
  try {
    const urls = JSON.parse(json);
    return Array.isArray(urls) ? urls.filter(peerUrlAllowed) : [];
  } catch {
    return [];
  }
}

/**
 * Reads a peer credential from T3's secret store: no symlinks, a regular file
 * owned by this user with mode exactly 0600, read through the descriptor it
 * checked.
 */
export function readPeerToken(secretsDir, secretName) {
  if (!SECRET_NAME.test(String(secretName ?? ''))) return null;
  let fd;
  try {
    fd = fs.openSync(
      path.join(secretsDir, `${secretName}.bin`),
      // Non-blocking, so a FIFO planted at the path cannot stall the tick.
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) return null;
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid())
      return null;
    const token = fs.readFileSync(fd, 'utf8').trim();
    return token.length >= 16 && !/\s/.test(token) ? token : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** The JSON-RPC reply to request `id`, JSON or SSE framed. */
function rpcReply(contentType, text, id) {
  const messages = String(contentType).includes('text/event-stream')
    ? text
        .split(/\r?\n\r?\n/)
        .map((event) =>
          event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''))
            .join('\n')
        )
        .filter(Boolean)
        .map((data) => JSON.parse(data))
    : [JSON.parse(text)];
  const reply = messages.flat().find((message) => message?.id === id);
  if (!reply || reply.jsonrpc !== '2.0') throw new Error('peer_rpc_mismatch');
  if (reply.error || !reply.result || typeof reply.result !== 'object')
    throw new Error('peer_rpc_error');
  return reply.result;
}

function toolPayload(result) {
  if (result.isError) throw new Error('peer_tool_error');
  if (result.structuredContent && typeof result.structuredContent === 'object')
    return result.structuredContent;
  const text = result.content?.find(
    (part) => typeof part?.text === 'string'
  )?.text;
  if (!text) throw new Error('peer_tool_empty');
  return JSON.parse(text);
}

function signalFor(timeoutMs, deadline) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return deadline ? AbortSignal.any([timeout, deadline]) : timeout;
}

/** One short MCP session against a peer; always closed afterwards. */
export async function withPeerSession(
  {
    url,
    token,
    fetchImpl = fetch,
    timeoutMs = 6_000,
    deadline,
    onLease,
    leaseValid = () => true,
  },
  run
) {
  const endpoint = new URL('/mcp', url).href;
  let sessionId;
  let protocolVersion;
  let id = 0;
  const send = async (method, params, notify = false) => {
    const requestId = notify ? undefined : ++id;
    // The link may lapse mid-run; no credential goes out after it does.
    if (!leaseValid()) throw new Error('peer_lease_expired');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
        ...(protocolVersion ? { 'mcp-protocol-version': protocolVersion } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        ...(notify ? {} : { id: requestId }),
      }),
      redirect: 'error',
      signal: signalFor(timeoutMs, deadline),
    });
    sessionId = response.headers.get('mcp-session-id') ?? sessionId;
    // Using a link renews it; the peer says until when.
    const lease = response.headers.get(LINK_EXPIRES_AT_HEADER);
    if (response.ok && lease && !Number.isNaN(Date.parse(lease)))
      onLease?.(new Date(lease).toISOString());
    if (!response.ok) throw new Error(`peer_http_${response.status}`);
    const text = await response.text();
    if (notify) return undefined;
    return rpcReply(response.headers.get('content-type'), text, requestId);
  };
  try {
    const init = await send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'mastermind-fleet-publisher', version: '1' },
    });
    if (typeof init.protocolVersion !== 'string')
      throw new Error('peer_init_invalid');
    protocolVersion = init.protocolVersion;
    await send('notifications/initialized', {}, true);
    return await run((name, args) =>
      send('tools/call', { name, arguments: args }).then(toolPayload)
    );
  } finally {
    // Closing carries the credential too, so it needs a live lease as well.
    if (sessionId && leaseValid())
      await fetchImpl(endpoint, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`,
          'mcp-session-id': sessionId,
          ...(protocolVersion
            ? { 'mcp-protocol-version': protocolVersion }
            : {}),
        },
        redirect: 'error',
        // Closing gets its own short timeout even past the deadline.
        signal: AbortSignal.timeout(PEER_CLOSE_MS),
      }).catch(() => undefined);
  }
}

const THREAD_STATUSES = new Set([
  'idle',
  'preparing',
  'queued',
  'starting',
  'running',
  'waiting',
  'completed',
  'interrupted',
  'failed',
  'cancelled',
  'rolled_back',
]);

function validRow(thread) {
  return (
    !!thread &&
    typeof thread === 'object' &&
    typeof thread.threadId === 'string' &&
    thread.threadId.length > 0 &&
    typeof thread.title === 'string' &&
    THREAD_STATUSES.has(thread.status) &&
    typeof thread.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(thread.updatedAt)) &&
    (thread.latestRunId === null || typeof thread.latestRunId === 'string')
  );
}

/**
 * A whole page or nothing: one malformed row, or a cursor that is missing or
 * does not advance past the one requested, fails the listing.
 */
function threadPage(result, requested) {
  if (
    !result ||
    !Array.isArray(result.threads) ||
    !result.threads.every(validRow) ||
    !(
      result.nextCursor === null ||
      (Number.isInteger(result.nextCursor) && result.nextCursor > requested)
    )
  )
    throw new Error('peer_list_invalid');
  return result;
}

/**
 * Lists a peer's threads as fleet thread rows: active ones in priority order
 * (running, then waiting, then queued, paged up to the lane cap), then failed
 * and recent threads that have a run and changed in the last 24 hours.
 */
export async function listPeerThreads(callTool, now = new Date()) {
  const since = now.getTime() - DAY_MS;
  const byId = new Map();
  const add = (threads, keep) => {
    for (const thread of threads) {
      if (
        typeof thread?.threadId !== 'string' ||
        byId.has(thread.threadId) ||
        Number.isNaN(Date.parse(thread.updatedAt)) ||
        !keep(thread)
      )
        continue;
      byId.set(thread.threadId, {
        threadId: thread.threadId,
        title: thread.title,
        state: laneStateFor(thread.status),
        ...(['cancelled', 'interrupted', 'rolled_back'].includes(thread.status)
          ? { resolution: 'cancelled' }
          : {}),
        projectId: thread.projectId,
        provider: thread.providerInstanceId,
        model: thread.model,
        parentThreadId: thread.parentThreadId ?? undefined,
        updatedAt: thread.updatedAt,
      });
    }
  };
  const recentRun = (thread) =>
    !!thread.latestRunId && Date.parse(thread.updatedAt) >= since;
  const list = (args) =>
    callTool('t3_thread_list', {
      allProjects: true,
      includeSubagents: true,
      ...args,
    }).then((result) => threadPage(result, args.cursor ?? 0));
  // One page usually holds every active thread; only past it does paging by
  // status keep running work ahead of newer queued threads.
  const totals = {};
  const first = await list({ statuses: ACTIVE_GROUPS.flat(), limit: PAGE });
  if (first.nextCursor === null) add(first.threads, () => true);
  else
    for (const statuses of ACTIVE_GROUPS) {
      let cursor = 0;
      do {
        const full = byId.size >= MAX_PEER_LANES;
        // Past the cap one row still reports the group's total.
        const result = await list({ statuses, limit: full ? 1 : PAGE, cursor });
        if (Number.isInteger(result.total))
          totals[laneStateFor(statuses[0])] ??= result.total;
        if (full) break;
        add(result.threads, () => true);
        cursor = result.nextCursor;
      } while (cursor !== null);
    }
  // Failed and recent rows come newest first: page until rows pass the
  // 24-hour cutoff, the list ends or the lane cap fills. The peer deadline
  // bounds it; running out fails the whole listing, so a partial scan never
  // replaces a complete cached one. Eligibility uses the thread's update time,
  // the only time the list reports: a metadata edit on an old thread can bring
  // it into the idle or failed count for a day.
  const pageRecent = async (statuses) => {
    let cursor = 0;
    for (let page = 0; page < RECENT_PAGES; page++) {
      if (cursor === null || byId.size >= MAX_PEER_LANES) return;
      const result = await list({
        ...(statuses ? { statuses } : {}),
        limit: PAGE,
        cursor,
      });
      add(result.threads, recentRun);
      const last = result.threads.at(-1);
      if (!last || Date.parse(last.updatedAt) < since) return;
      cursor = result.nextCursor;
    }
  };
  const [, projects] = await Promise.all([
    pageRecent(['failed']).then(() => pageRecent()),
    callTool('t3_project_list', { limit: PAGE }).then(
      (listed) =>
        new Map(
          (listed?.projects ?? []).map((project) => [project.id, project.title])
        ),
      // Project names are optional decoration.
      () => new Map()
    ),
  ]);
  const rows = [...byId.values()].slice(0, MAX_PEER_LANES).map((row) => ({
    ...row,
    ...(projects.get(row.projectId)
      ? { projectTitle: projects.get(row.projectId) }
      : {}),
  }));
  // Active threads past the lane cap still count, by T3's per-status totals.
  const extraCounts = {};
  for (const [state, total] of Object.entries(totals)) {
    const listed = rows.filter((row) => row.state === state).length;
    if (total > listed) extraCounts[state] = total - listed;
  }
  rows.extraCounts = extraCounts;
  return rows;
}

/**
 * Probes every linked environment and returns one peer record each, with its
 * heartbeat status and its threads. `cache` holds the last successful listing
 * per link; a peer that misses probes keeps those threads only while both the
 * peer is not offline and the listing is younger than PEER_STALE_MS.
 */
export async function readPeers({
  links,
  secretsDir,
  cache = {},
  now = new Date(),
  fetchImpl = fetch,
  listThreads = listPeerThreads,
  deadlineMs = PEER_DEADLINE_MS,
  tickStartedAt = Date.now(),
}) {
  const clock = () => now.getTime() + (Date.now() - tickStartedAt);
  const nextCache = {};
  const peers = await Promise.all(
    links.map(async (link) => {
      // A link generation: re-linking changes the credential or link time.
      const linkKey = [
        link.environment_id,
        link.secret_name ?? '',
        link.linked_at ?? '',
      ].join(':');
      const cached = cache[link.environment_id];
      const previous = cached?.linkKey === linkKey ? cached : undefined;
      // T3 treats an unfenced link as expired from the time it was linked.
      const fenced = link.fenced === 1 || link.fenced === true;
      let leaseExpiresAt = fenced
        ? latest(link.expires_at, previous?.leaseExpiresAt)
        : link.linked_at;
      // The run's clock: `now` plus the time elapsed since the run began.
      const leaseValid = () =>
        fenced && !!leaseExpiresAt && Date.parse(leaseExpiresAt) > clock();
      const expired =
        !fenced ||
        !leaseExpiresAt ||
        Date.parse(leaseExpiresAt) <= now.getTime();
      const token = expired
        ? null
        : readPeerToken(secretsDir, link.secret_name);
      let threads;
      const deadline = AbortSignal.timeout(deadlineMs);
      // Descriptor probes race, as T3's do; addresses answering as this
      // environment are then tried in the link's order.
      const answering = token
        ? (
            await Promise.all(
              parseUrls(link.urls_json).map((url) =>
                answersAs(url, link.environment_id, {
                  fetchImpl,
                  deadline,
                }).then((ok) => (ok ? url : null))
              )
            )
          ).filter(Boolean)
        : [];
      if (token)
        for (const url of answering) {
          if (deadline.aborted || !leaseValid()) break;
          try {
            threads = await withPeerSession(
              {
                url,
                token,
                fetchImpl,
                deadline,
                onLease: (at) => {
                  leaseExpiresAt = latest(leaseExpiresAt, at);
                },
                leaseValid,
              },
              (call) => listThreads(call, now)
            );
            break;
          } catch {
            // Try the link's next address.
          }
        }
      const live = threads !== undefined;
      const lastSeenAt = live
        ? now.toISOString()
        : latest(previous?.lastSeenAt, link.last_reached_at);
      const status = classifyPeer(
        { reachedNow: live, lastSeenAt, expiresAt: leaseExpiresAt },
        new Date(clock())
      );
      const lanesAt = live ? now.toISOString() : previous?.lanesAt;
      const lanesFresh =
        !!lanesAt && now.getTime() - Date.parse(lanesAt) <= PEER_STALE_MS;
      const keepCached = !live && status !== 'offline' && lanesFresh;
      const kept = live ? threads : keepCached ? (previous?.threads ?? []) : [];
      const extraCounts = live
        ? (threads.extraCounts ?? {})
        : keepCached
          ? (previous?.extraCounts ?? {})
          : {};
      nextCache[link.environment_id] = {
        linkKey,
        ...(leaseExpiresAt ? { leaseExpiresAt } : {}),
        ...(lastSeenAt ? { lastSeenAt } : {}),
        ...(lanesFresh && !expired
          ? { lanesAt, threads: kept, extraCounts }
          : {}),
      };
      return {
        environment_id: link.environment_id,
        label: link.label,
        status,
        live,
        extraCounts,
        ...(lastSeenAt ? { lastSeenAt } : {}),
        threads: kept,
      };
    })
  );
  return { peers, cache: nextCache };
}
