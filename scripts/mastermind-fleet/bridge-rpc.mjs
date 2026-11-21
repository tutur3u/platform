// Read requests of the Mastermind fleet bridge: the owner's thread list and
// thread history, answered on demand from the local T3 server (and, through
// it, from linked machines). Web signs each request and seals its arguments;
// the answer is sealed for Web, so the store Worker in between relays
// ciphertext only and nothing about threads rests in the cloud.
// Wire contract: packages/utils/src/mastermind-store/bridge-protocol.ts
// (bridge-rpc.test.mjs keeps the signed bytes and labels identical to it).
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { localReads, NO_PROJECT, threadState } from './bridge-local.mjs';
import { fleetText } from './scrub.mjs';

export { threadState };

export const RPC_DOMAIN = 'mastermind-fleet-rpc-v1';
export const RPC_KEY_INFO = 'mastermind-fleet-rpc-enc-v1';
const PROTOCOL_VERSION = 1;
const MAX_LIFETIME_MS = 30_000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** Sealed answers stay under the bridge's frame limit. */
export const MAX_ANSWER_BYTES = 240 * 1024;
const MESSAGE_MAX_CHARS = 4000;
const TITLE_MAX = 120;
/** Past the last item of any thread. */
const NEWEST_POSITION = 2_000_000_000;
/** A message is scanned for credentials up to this many times its cap. */
const SCAN_FACTOR = 4;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MACHINE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const THREAD_ID = /^[\w:%.][\w:%.-]{0,399}$/;
const ENVIRONMENT_ID = /^\w[\w-]{0,99}$/;
const SIGNATURE = /^[0-9a-f]{64}$/;
const SEAL_IV = /^[\w-]{16}$/;
const SEAL_DATA = /^[\w-]{23,22000}$/;
const PROJECT_ID = /^[\w:%.-]{1,400}$/;
const KINDS = new Set(['machines', 'projects', 'threads', 'transcript']);
const STATES = new Set(['running', 'waiting', 'failed', 'idle']);
/** T3's run statuses, grouped into the states the owner filters by. */
const T3_STATUSES = [
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
];
const statusesOf = (state) =>
  T3_STATUSES.filter((status) => threadState(status) === state);
const REQUEST_KEYS = new Set([
  'id',
  'machineId',
  'kind',
  'box',
  'issuedAt',
  'expiresAt',
]);

const rpcKey = (secret) =>
  Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), RPC_KEY_INFO, 32));

/** The bytes Web signs for a read request; identical to `bridgeRpcSigningString`. */
export function rpcSigningString(request) {
  return [
    RPC_DOMAIN,
    request.id,
    request.machineId,
    request.kind,
    String(request.issuedAt),
    String(request.expiresAt),
    request.box.iv,
    request.box.data,
  ].join('\n');
}

const sealContext = (direction, request) =>
  Buffer.from(`${direction}\n${request.id}\n${request.machineId}`, 'utf8');

function open(secret, request) {
  const data = Buffer.from(request.box.data, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    rpcKey(secret),
    Buffer.from(request.box.iv, 'base64url')
  );
  decipher.setAAD(sealContext('req', request));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([
    decipher.update(data.subarray(0, data.length - 16)),
    decipher.final(),
  ]).toString('utf8');
}

/** The `res` frame for `payload`, sealed so only a holder of the fleet secret reads it. */
export function sealAnswer(secret, request, payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', rpcKey(secret), iv);
  cipher.setAAD(sealContext('res', request));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    v: PROTOCOL_VERSION,
    t: 'res',
    id: request.id,
    box: { iv: iv.toString('base64url'), data: data.toString('base64url') },
  };
}

const isTime = (value) => Number.isSafeInteger(value) && value >= 0;

/**
 * Checks a `req` frame: shape, Web's signature over every field, addressee
 * and lifetime, then opens its arguments. Null when it is not a request this
 * machine should answer; nothing is sent back for those.
 */
export function verifyRequest(frame, { secret, machineId, now = Date.now() }) {
  const request = frame?.request;
  if (
    frame?.v !== PROTOCOL_VERSION ||
    frame.t !== 'req' ||
    typeof request !== 'object' ||
    request === null ||
    Object.keys(request).some((key) => !REQUEST_KEYS.has(key)) ||
    !UUID.test(String(request.id ?? '')) ||
    !MACHINE_ID.test(String(request.machineId ?? '')) ||
    !KINDS.has(request.kind) ||
    typeof request.box !== 'object' ||
    request.box === null ||
    Object.keys(request.box).length !== 2 ||
    !SEAL_IV.test(String(request.box.iv ?? '')) ||
    !SEAL_DATA.test(String(request.box.data ?? '')) ||
    !isTime(request.issuedAt) ||
    !isTime(request.expiresAt) ||
    !SIGNATURE.test(String(frame.sig ?? ''))
  )
    return null;
  const expected = createHmac('sha256', secret)
    .update(rpcSigningString(request), 'utf8')
    .digest();
  const given = Buffer.from(frame.sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  if (
    request.machineId !== machineId ||
    request.issuedAt > now + CLOCK_SKEW_MS ||
    request.expiresAt <= now ||
    request.expiresAt - request.issuedAt > MAX_LIFETIME_MS
  )
    return null;
  try {
    const args = JSON.parse(open(secret, request));
    return args && typeof args === 'object' && !Array.isArray(args)
      ? { request, args }
      : null;
  } catch {
    return null;
  }
}

// Credentials only: a transcript keeps its paths, links and line breaks, which
// the owner already sees in T3, but never a key, token or password. Every
// quantifier next to a keyword is bounded, so a long hostile word costs time
// in proportion to its length, not its square.
const NAMED = String.raw`secret|token|password|passwd|passphrase|pwd|api[_-]?key|credential|private[_-]?key`;
/** A commit id is kept when the text names it as one, and only at its exact length. */
const COMMIT_CONTEXT =
  /(?:\bcommit |\bsha |\brev |\/commit\/|\/tree\/|\/blob\/)$/i;
const REDACTIONS = [
  // PEM blocks, whole.
  [/-----BEGIN[\s\S]*?(-----END[^-]*-----|$)/gi, '[redacted]'],
  // `scheme://user:password@host`: the password only.
  [
    /(\b[a-z][a-z0-9+.-]{0,20}:\/\/[^\s/:@]{1,80}:)[^\s@/]{1,200}@/gi,
    '$1[redacted]@',
  ],
  // A named value: `"api_key": "…"`, `PASSWORD='…'`, `token = the rest of the line`.
  [
    new RegExp(
      String.raw`((?<![\w-])["']?[\w-]{0,40}(?:${NAMED})[\w-]{0,40}["']?[ \t]{0,8}[:=][ \t]{0,8})(?:"[^"\n]{0,400}"|'[^'\n]{0,400}'|[^\n]+)`,
      'gi'
    ),
    '$1[redacted]',
  ],
  // A bearer or basic value that looks like a token, not like a word.
  [
    // No `i` flag: the lookahead must tell an upper-case letter from a word.
    /\b([Bb]earer|BEARER|[Bb]asic|BASIC)\s+(?=[\w.~+/=-]{0,200}[0-9A-Z=+/])[\w.~+/=-]{8,}/g,
    '$1 [redacted]',
  ],
  [/\beyJ[\w-]{6,}\.[\w-]{6,}(\.[\w-]+)?/g, '[redacted]'],
  // Provider key prefixes, each with the separator its keys really have.
  [
    /\b(?:(?:sk|pk|rk)[-_]|gh[opsu]_|github_pat_|xox[abpr]-|glpat-)[-_A-Za-z0-9]{8,}/g,
    '[redacted]',
  ],
  [
    /\b(?:AKIA[0-9A-Z]{12,}|AIza[-_A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{30,})/g,
    '[redacted]',
  ],
  // Hex of 32 characters or more, except a 40-character commit id named as one.
  [
    /\b[A-Fa-f0-9]{32,}\b/g,
    (match, offset, whole) =>
      match.length === 40 &&
      COMMIT_CONTEXT.test(whole.slice(Math.max(0, offset - 8), offset))
        ? match
        : '[redacted]',
  ],
  // A 40-character key with mixed case and digits (cloud secret keys).
  [
    /(?<![\w/+=.-])(?=[A-Za-z0-9/+]{0,39}[0-9])(?=[A-Za-z0-9/+]{0,39}[a-z])(?=[A-Za-z0-9/+]{0,39}[A-Z])[A-Za-z0-9/+]{40}(?![\w/+=.-])/g,
    '[redacted]',
  ],
  // Long base64 or base64url runs; no slash, so file paths stay readable.
  [/\b[A-Za-z0-9+_-]{48,}={0,2}/g, '[redacted]'],
];
const INVISIBLE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]',
  'g'
);

/** Message text for the owner: credentials replaced, layout kept, length capped. */
export function scrubTranscriptText(value, max = MESSAGE_MAX_CHARS) {
  const raw = String(value ?? '');
  // Only what could still be shown is scanned, so one huge message costs no
  // more than a normal one.
  let text = raw.slice(0, max * SCAN_FACTOR).replace(INVISIBLE, '');
  for (const [pattern, replacement] of REDACTIONS)
    text = text.replace(pattern, replacement);
  const truncated = text.length > max || raw.length > max * SCAN_FACTOR;
  return { text: truncated ? `${text.slice(0, max - 1)}…` : text, truncated };
}

function threadView(thread, projects) {
  const project = projects?.get(thread.projectId);
  return {
    threadId: thread.threadId,
    title: fleetText(String(thread.title ?? ''), TITLE_MAX) || 'Untitled',
    ...(typeof thread.projectId === 'string'
      ? { projectId: thread.projectId.slice(0, 400) }
      : {}),
    ...(project ? { project } : {}),
    state: threadState(thread.status),
    updatedAt: String(thread.updatedAt ?? '').slice(0, 40),
    itemCount: Number.isSafeInteger(thread.itemCount) ? thread.itemCount : 0,
  };
}

const target = (args) =>
  args.environmentId === undefined ? {} : { environmentId: args.environmentId };

async function projectTitles(call, args) {
  const titles = new Map();
  try {
    const listed = await call('t3_project_list', {
      ...target(args),
      limit: 100,
    });
    for (const project of listed?.projects ?? [])
      if (typeof project?.id === 'string')
        titles.set(project.id, fleetText(String(project.title ?? ''), 80));
  } catch {
    // Project names are a convenience; the list still stands without them.
  }
  return titles;
}

const READS = {
  async machines(call) {
    const listed = await call('t3_environment_links', {});
    return {
      machines: [
        { label: 'This machine', reachable: true },
        ...(listed?.links ?? [])
          .filter((link) => ENVIRONMENT_ID.test(String(link?.environmentId)))
          .slice(0, 31)
          .map((link) => ({
            environmentId: link.environmentId,
            label: fleetText(String(link.label ?? ''), 80) || 'Machine',
            reachable: link.status === 'reachable',
          })),
      ],
    };
  },

  async threads(call, args) {
    const limit = Number.isInteger(args.limit)
      ? Math.min(Math.max(args.limit, 1), 50)
      : 50;
    const query =
      typeof args.query === 'string' ? args.query.trim().slice(0, 100) : '';
    // T3 lists one project or all of them; it has no filter for "in none".
    if (args.projectId === NO_PROJECT) throw new BadRequest();
    const [listed, projects] = await Promise.all([
      call('t3_thread_list', {
        ...target(args),
        ...(args.projectId
          ? { projectId: args.projectId }
          : { allProjects: true }),
        ...(args.state ? { statuses: statusesOf(args.state) } : {}),
        limit,
        ...(Number.isInteger(args.cursor) && args.cursor >= 0
          ? { cursor: args.cursor }
          : {}),
        ...(query ? { titleContains: query } : {}),
      }),
      projectTitles(call, args),
    ]);
    return {
      threads: (listed?.threads ?? [])
        .filter((thread) => THREAD_ID.test(String(thread?.threadId)))
        .slice(0, limit)
        .map((thread) => threadView(thread, projects)),
      nextCursor: Number.isInteger(listed?.nextCursor)
        ? listed.nextCursor
        : null,
      total: Number.isInteger(listed?.total) ? listed.total : 0,
    };
  },

  async transcript(call, args) {
    if (!THREAD_ID.test(String(args.threadId ?? ''))) throw new BadRequest();
    const limit = Number.isInteger(args.limit)
      ? Math.min(Math.max(args.limit, 1), 30)
      : 30;
    const read = await call('t3_thread_read', {
      ...target(args),
      threadId: args.threadId,
      limit,
      maxCharsPerItem: MESSAGE_MAX_CHARS,
      // T3 pages back from `beforePosition`; without one it starts at the
      // oldest item, so the newest page is asked for from past the end.
      beforePosition:
        Number.isInteger(args.before) && args.before >= 0
          ? args.before
          : NEWEST_POSITION,
    });
    const messages = (read?.items ?? [])
      .filter(
        (item) =>
          (item?.type === 'user_message' ||
            item?.type === 'assistant_message') &&
          Number.isSafeInteger(item.position) &&
          typeof item.text === 'string' &&
          item.text.trim()
      )
      .slice(-limit)
      .map((item) => {
        const scrubbed = scrubTranscriptText(item.text);
        return {
          position: item.position,
          role: item.type === 'user_message' ? 'user' : 'assistant',
          text: scrubbed.text,
          truncated: scrubbed.truncated || item.textTruncated === true,
          at: String(item.updatedAt ?? '').slice(0, 40),
        };
      });
    const answer = {
      thread: threadView({ ...read?.thread, threadId: args.threadId }),
      messages,
      earlierPosition: Number.isInteger(read?.earlierPosition)
        ? read.earlierPosition
        : null,
    };
    return fitAnswer(answer);
  },
};

class BadRequest extends Error {}

const THREAD_GONE =
  /\bthread\b[^.]*\b(was not found|not found|does not exist|no such|no longer available)\b|\b(unknown|no such) thread\b/i;

/** Trims a history page to fit one frame, dropping the oldest messages first. */
function fitAnswer(answer) {
  while (
    answer.messages.length > 1 &&
    Buffer.byteLength(JSON.stringify(answer)) > MAX_ANSWER_BYTES
  ) {
    answer.messages.splice(0, 1);
    answer.earlierPosition = answer.messages[0].position;
  }
  return answer;
}

const clamp = (value, fallback, max) =>
  Number.isInteger(value) ? Math.min(Math.max(value, 1), max) : fallback;

/** A read of this machine itself, answered from its own database. */
function readLocally(kind, args, db, local) {
  const reads = localReads(db, { scrub: scrubTranscriptText, ...local });
  if (kind === 'machines') return reads.machines();
  if (kind === 'projects') return reads.projects();
  if (kind === 'threads') {
    const query =
      typeof args.query === 'string' ? args.query.trim().slice(0, 100) : '';
    return reads.threads({
      ...(query ? { query } : {}),
      cursor:
        Number.isInteger(args.cursor) && args.cursor >= 0 ? args.cursor : 0,
      limit: clamp(args.limit, 50, 50),
      ...(args.projectId ? { projectId: args.projectId } : {}),
      ...(args.state ? { state: args.state } : {}),
      ownerReply: args.ownerReply === true,
    });
  }
  if (!THREAD_ID.test(String(args.threadId ?? ''))) throw new BadRequest();
  const page = reads.transcript({
    threadId: args.threadId,
    ...(Number.isInteger(args.before) && args.before >= 0
      ? { before: args.before }
      : {}),
    limit: clamp(args.limit, 30, 30),
  });
  if (!page) throw new UnknownThread();
  return fitAnswer(page);
}

class UnknownThread extends Error {}

const MAX_CURSOR = 100_000;
const MAX_POSITION = 2_000_000_000;
const optionalInt = (value, max) =>
  value === undefined ||
  (Number.isInteger(value) && value >= 0 && value <= max);

/**
 * The opened arguments, checked by type and range. Web validates them before
 * sealing; this is the machine's own check of what reaches T3 or the database.
 */
function validArgs(kind, args) {
  if (
    args.environmentId !== undefined &&
    (typeof args.environmentId !== 'string' ||
      !ENVIRONMENT_ID.test(args.environmentId))
  )
    return false;
  if (kind === 'machines') return true;
  // Projects are grouped from this machine's own database only.
  if (kind === 'projects') return args.environmentId === undefined;
  if (!optionalInt(args.limit, 50)) return false;
  if (kind === 'threads')
    return (
      optionalInt(args.cursor, MAX_CURSOR) &&
      (args.query === undefined || typeof args.query === 'string') &&
      (args.projectId === undefined ||
        (typeof args.projectId === 'string' &&
          PROJECT_ID.test(args.projectId))) &&
      (args.state === undefined || STATES.has(args.state)) &&
      (args.ownerReply === undefined || typeof args.ownerReply === 'boolean')
    );
  return (
    typeof args.threadId === 'string' &&
    THREAD_ID.test(args.threadId) &&
    optionalInt(args.before, MAX_POSITION)
  );
}

/**
 * Handles one `req` frame and returns the sealed `res` frame, or null for a
 * frame that is not a valid request for this machine. Threads, projects and
 * history of this machine are answered from `openDatabase()` (T3's projection
 * database, read-only); a read of a linked machine, and the list of machines,
 * go through `call(name, args)`, an open T3 MCP session's tool call, with
 * read tools only. A linked machine's threads carry no owner-reply time.
 * `scratchRoot` and `bridgeReplyAt` are passed on to the local reads. A database that cannot be opened, is busy or does not have the
 * expected tables answers `unavailable`, like any other failed read.
 */
export async function handleRequest(
  frame,
  {
    secret,
    machineId,
    call,
    openDatabase,
    scratchRoot,
    bridgeReplyAt,
    now = Date.now,
  }
) {
  const verified = verifyRequest(frame, { secret, machineId, now: now() });
  if (!verified) return null;
  const { request, args } = verified;
  if (!validArgs(request.kind, args))
    return sealAnswer(secret, request, { ok: false, code: 'bad_request' });
  try {
    const fromDatabase = () => {
      const db = openDatabase();
      try {
        return readLocally(request.kind, args, db, {
          scratchRoot,
          bridgeReplyAt,
        });
      } finally {
        db.close();
      }
    };
    let data;
    if (request.kind === 'machines') {
      // T3 knows which linked machines answer right now; the database only
      // knows which links still stand, and serves when T3 cannot be asked.
      data = await READS.machines(call).catch((error) => {
        if (!openDatabase) throw error;
        return fromDatabase();
      });
    } else if (args.environmentId === undefined && openDatabase) {
      data = fromDatabase();
    } else if (request.kind === 'projects') {
      throw new Error('projects are read from the database only');
    } else {
      data = await READS[request.kind](call, args);
    }
    return sealAnswer(secret, request, { ok: true, data });
  } catch (error) {
    const code =
      error instanceof BadRequest
        ? 'bad_request'
        : error instanceof UnknownThread ||
            (error?.code === 't3_tool_error' &&
              THREAD_GONE.test(String(error.detail ?? '')))
          ? 'unknown_thread'
          : 'unavailable';
    return sealAnswer(secret, request, { ok: false, code });
  }
}
