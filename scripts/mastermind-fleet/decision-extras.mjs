// Fleet sync additions read from the orchestrator's fleet-sync folder:
// decision context and login requests, recently resolved decisions and the
// release-train status. Mirrors the Web contract
// (apps/web/src/lib/mastermind/fleet/contract.ts and login.ts) closely enough
// that one malformed file is dropped here instead of failing the whole
// snapshot. Free text goes through the same scrub and caps as the route
// (scrub.mjs). The Web route remains the authority.
import fs from 'node:fs';
import path from 'node:path';
import { parseReview } from './review-extras.mjs';
import { fleetText } from './scrub.mjs';
import { parseSecret, parseSecretOutcome } from './secret-decision.mjs';

const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHORT_SHA = /^[0-9a-f]{7,12}$/;
const USER_CODE = /^[A-Z0-9]{3,8}(-[A-Z0-9]{3,8}){0,2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COUNT = 1_000_000;
const RESOLVED_SCAN_MAX = 100;
/** Login requests expire within a day; the server enforces the same bound. */
export const LOGIN_MAX_TTL_MS = DAY_MS;

/** Keep in sync with FLEET_LOGIN_HOSTS in login.ts (a Web test compares). */
export const LOGIN_HOSTS = {
  github: ['github.com'],
  cloudflare: ['dash.cloudflare.com'],
  vercel: ['vercel.com'],
  claude: ['claude.ai', 'claude.com', 'console.anthropic.com'],
  openai: ['auth.openai.com', 'chatgpt.com', 'platform.openai.com'],
  google: ['accounts.google.com'],
  apple: ['appleid.apple.com', 'appstoreconnect.apple.com'],
  supabase: ['supabase.com'],
  microsoft: ['microsoft.com', 'login.microsoftonline.com'],
};
const LOGIN_FLOWS = new Set(['device', 'link', 'local_callback']);
const LOGIN_STATES = new Set([
  'waiting',
  'approved',
  'verified',
  'expired',
  'failed',
]);
const TERMINAL = new Set(['verified', 'expired', 'failed']);
const CHANNELS = new Set(['mastermind', 'mobile', 'whatsapp', 'cli']);
const V1_COUNTS = new Set(['running', 'waiting', 'queued', 'idle', 'failed']);

function iso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : undefined;
}

function onAllowlist(service, host) {
  return LOGIN_HOSTS[service].some((h) => host === h || host.endsWith(`.${h}`));
}

function loopback(url) {
  return (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}

/**
 * Keep in sync with safeLoginUrl in login.ts. Beyond the host allowlist: no
 * fragment, no query on device pages, and an OAuth authorize link must send
 * its code back to a loopback listener (the agent's own CLI) or to the same
 * provider, never to a third-party callback.
 */
export function safeLoginUrl(service, raw, flow = 'link') {
  if (!LOGIN_HOSTS[service] || typeof raw !== 'string' || raw.length > 2048)
    return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return null;
  if (url.hash || !onAllowlist(service, url.hostname.toLowerCase()))
    return null;
  if (flow === 'device' && url.search) return null;
  const params = url.searchParams;
  // One value per OAuth parameter: a provider picking a later duplicate
  // would use a callback this check never saw.
  for (const key of ['client_id', 'response_type', 'redirect_uri'])
    if (params.getAll(key).length > 1) return null;
  if (params.has('client_id') || params.has('response_type')) {
    let redirect;
    try {
      redirect = new URL(params.get('redirect_uri') ?? '');
    } catch {
      return null;
    }
    const providerHosted =
      redirect.protocol === 'https:' &&
      onAllowlist(service, redirect.hostname.toLowerCase());
    if (!loopback(redirect) && !providerHosted) return null;
    // Loopback reaches whichever device opens the link, so it only works
    // on the agent's machine: such a link must say so.
    if (loopback(redirect) && flow !== 'local_callback') return null;
  }
  const normalized = url.toString();
  return normalized.length > 2048 ? null : normalized;
}

/** Returns a contract-valid login payload, or null when unusable. */
export function parseLogin(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') return null;
  const { service, flow } = raw;
  if (!Object.hasOwn(LOGIN_HOSTS, service) || !LOGIN_FLOWS.has(flow))
    return null;
  let state = LOGIN_STATES.has(raw.state) ? raw.state : 'waiting';
  const expiresAt = iso(raw.expiresAt);
  if (
    !TERMINAL.has(state) &&
    expiresAt &&
    Date.parse(expiresAt) <= now.getTime()
  )
    state = 'expired';
  const machineId =
    typeof raw.machineId === 'string' && SLUG.test(raw.machineId)
      ? raw.machineId
      : undefined;
  const base = {
    service,
    flow,
    state,
    ...(expiresAt ? { expiresAt } : {}),
    ...(machineId ? { machineId } : {}),
  };
  // Terminal requests never carry the link or code.
  if (TERMINAL.has(state)) return base;
  if (flow === 'local_callback' && !machineId) return null;
  if (!expiresAt || Date.parse(expiresAt) > now.getTime() + LOGIN_MAX_TTL_MS)
    return null;
  const url = safeLoginUrl(service, raw.url, flow);
  if (!url) return null;
  const code =
    typeof raw.userCode === 'string' ? raw.userCode.trim().toUpperCase() : '';
  if (flow === 'device') {
    if (!USER_CODE.test(code)) return null;
    return { ...base, url, userCode: code };
  }
  return { ...base, url };
}

/** Optional context fields and the login kind for one decision file. */
export function parseDecisionExtras(raw, now = new Date()) {
  const extras = {};
  const why = fleetText(raw.why, 240);
  const defaultOutcome = fleetText(raw.defaultOutcome, 160);
  const requester = fleetText(raw.requester, 60);
  if (why) extras.why = why;
  if (defaultOutcome) extras.defaultOutcome = defaultOutcome;
  if (requester) extras.requester = requester;
  if (raw.kind === 'login') {
    const login = parseLogin(raw.login, now);
    if (!login) return null;
    extras.kind = 'login';
    extras.login = login;
  } else if (raw.kind === 'review') {
    const review = parseReview(raw.review);
    if (!review) return null;
    extras.kind = 'review';
    extras.review = review;
  } else if (raw.kind === 'secret') {
    const secret = parseSecret(raw, now);
    if (!secret) return null;
    extras.kind = 'secret';
    extras.secret = secret;
  } else if (raw.kind !== undefined && raw.kind !== 'ask') {
    return null;
  }
  return extras;
}

const readUtf8 = (file) => fs.readFileSync(file, 'utf8');

/**
 * Decisions resolved in the last 24 hours, newest first, at most 20. The
 * publisher passes a reader that refuses anything but a regular file, so a
 * FIFO cannot block the tick.
 */
export function readResolved(dir, now = new Date(), readText = readUtf8) {
  let names;
  try {
    // Most recently written first, bounded: the orchestrator prunes files
    // older than a day, and a neglected archive must not eat the tick budget.
    const mtime = (name) => {
      try {
        return fs.lstatSync(path.join(dir, name)).mtimeMs;
      } catch {
        return 0;
      }
    };
    names = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => [name, mtime(name)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, RESOLVED_SCAN_MAX)
      .map(([name]) => name);
  } catch {
    // Missing or not a directory: no history this tick.
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(readText(path.join(dir, name)));
      const resolvedAt = iso(raw.resolvedAt);
      const title = fleetText(raw.title, 120);
      if (
        !raw ||
        typeof raw.id !== 'string' ||
        !SLUG.test(raw.id) ||
        !title ||
        !resolvedAt ||
        now.getTime() - Date.parse(resolvedAt) > DAY_MS
      )
        continue;
      const outcome = fleetText(raw.outcome, 60);
      const secretOutcome =
        raw.kind === 'secret' ? parseSecretOutcome(raw.secretOutcome) : null;
      out.push({
        id: raw.id,
        kind: ['login', 'review', 'secret'].includes(raw.kind)
          ? raw.kind
          : 'ask',
        title,
        ...(CHANNELS.has(raw.answeredVia)
          ? { answeredVia: raw.answeredVia }
          : {}),
        ...(outcome ? { outcome } : {}),
        ...(secretOutcome ? { secretOutcome } : {}),
        resolvedAt,
      });
    } catch {
      // Unreadable files are skipped; the open-decision count reports skips.
    }
  }
  return out
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt))
    .slice(0, 20);
}

function enumOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/** Release-train status from `release.json`, or undefined when absent/invalid. */
export function readRelease(file, readText = readUtf8) {
  let raw;
  try {
    raw = JSON.parse(readText(file));
  } catch {
    return undefined;
  }
  if (!raw?.main || !['open', 'frozen'].includes(raw.main.state))
    return undefined;
  const count = (v) =>
    Number.isInteger(v) && v >= 0 && v <= MAX_COUNT ? v : undefined;
  const sha = (v) =>
    typeof v === 'string' && SHORT_SHA.test(v) ? v : undefined;
  const reason = fleetText(raw.main.reason, 120);
  const queued = count(raw.main.queued);
  const headSha = sha(raw.main.headSha);
  const release = {
    main: {
      state: raw.main.state,
      ...(reason ? { reason } : {}),
      ...(queued !== undefined ? { queued } : {}),
      ...(headSha ? { headSha } : {}),
    },
    incidents: [],
  };
  if (raw.production) {
    const prodSha = sha(raw.production.sha);
    const deployedAt = iso(raw.production.deployedAt);
    release.production = {
      state: enumOf(
        raw.production.state,
        ['healthy', 'degraded', 'down', 'unknown'],
        'unknown'
      ),
      ...(prodSha ? { sha: prodSha } : {}),
      ...(deployedAt ? { deployedAt } : {}),
    };
  }
  if (raw.migrations && count(raw.migrations.pending) !== undefined) {
    release.migrations = {
      pending: raw.migrations.pending,
      state: enumOf(
        raw.migrations.state,
        ['idle', 'staging', 'gated', 'applying', 'failed'],
        'idle'
      ),
    };
  }
  if (Array.isArray(raw.incidents)) {
    for (const incident of raw.incidents.slice(0, 10)) {
      const title = fleetText(incident?.title, 120);
      const openedAt = iso(incident?.openedAt);
      if (!SLUG.test(incident?.id ?? '') || !title || !openedAt) continue;
      release.incidents.push({
        id: incident.id,
        title,
        severity: enumOf(
          incident.severity,
          ['critical', 'high', 'medium', 'low'],
          'medium'
        ),
        openedAt,
      });
    }
  }
  return release;
}

/**
 * The v1 core of a snapshot: no resolved history, release status, login
 * requests, design reviews, secret requests, lane resolutions or decision
 * context. Returns the same object when there is
 * nothing to strip.
 */
export function baseFleetState(state) {
  const hasExtras =
    state.resolved ||
    state.release ||
    state.machines?.some((machine) => machine.todayOutcomes) ||
    state.lanes?.some((lane) => lane.resolution) ||
    Object.keys(state.counts ?? {}).some((key) => !V1_COUNTS.has(key)) ||
    state.decisions.some(
      (d) =>
        d.kind ||
        d.login ||
        d.review ||
        d.secret ||
        d.why ||
        d.defaultOutcome ||
        d.requester
    );
  if (!hasExtras) return state;
  const { resolved: _resolved, release: _release, ...rest } = state;
  return {
    ...rest,
    ...(state.machines
      ? {
          machines: state.machines.map(
            ({ todayOutcomes: _todayOutcomes, ...machine }) => machine
          ),
        }
      : {}),
    ...(state.counts
      ? {
          counts: Object.fromEntries(
            Object.entries(state.counts).filter(([key]) => V1_COUNTS.has(key))
          ),
        }
      : {}),
    ...(state.lanes
      ? {
          lanes: state.lanes.map(
            ({ resolution: _resolution, ...lane }) => lane
          ),
        }
      : {}),
    decisions: state.decisions
      .filter(
        (d) => d.kind !== 'login' && d.kind !== 'review' && d.kind !== 'secret'
      )
      .map(
        ({
          kind: _kind,
          login: _login,
          review: _review,
          secret: _secret,
          why: _why,
          defaultOutcome: _default,
          requester: _requester,
          ...decision
        }) => decision
      ),
  };
}
