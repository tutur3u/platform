import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, rename, unlink } from 'node:fs/promises';
import { dirname, resolve, parse } from 'node:path';
import { createServer } from 'node:http';
export const ACCOUNTS = Object.freeze({
  a1: 'qa-d241h-a1@tuturuuu.com',
  a2: 'qa-d241h-a2@tuturuuu.com',
});
export const REDIRECT = 'https://tuturuuu.com/login';
export const DEADLINE = '2026-11-17T16:59:00.000Z';
export const PROJECT_REF = 'nzamlzqfdwaaxdefwraj';
export const EXEC_ACK = 'D241Q-EXECUTION-01';
export const CLEAN_ACK = 'D241Q-CLEANUP-01';
export const SCHEMA_SHA256 =
  '4c1e57794701b22f5894550d5fbde2db0fc3b2bfad1525ac2fa062dbc1c28702';
export const need = (ok) => {
  if (!ok) throw new Error('REFUSED');
};
export const labels = ['a1', 'a2'];
export const DISPLAY_NAMES = { a1: 'QA D241h A1', a2: 'QA D241h A2' };
export function safeSurface(value) {
  need(typeof value === 'string' && value.length <= 96);
  need(
    /^(?:web|app:[a-z][a-z-]{1,30}):(login|logout|account-switch|dashboard|qa-workspace-create)$/.test(
      value
    )
  );
  need(!/shorten|time-tracking.*export|aurora|crawl/i.test(value));
  return value;
}
export const isUuid = (v) =>
  typeof v === 'string' &&
  /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
    v
  );
export function keys(v, names) {
  need(v && typeof v === 'object' && !Array.isArray(v));
  need(Object.keys(v).sort().join() === names.split(' ').sort().join());
}
export function binding(c) {
  keys(c, 'ack projectRef');
  need(/^D241[A-Za-z0-9_-]{1,96}$/.test(c.ack));
  need(typeof c.projectRef === 'string' && /^[a-z]{20}$/.test(c.projectRef));
  return `https://${c.projectRef}.supabase.co`;
}
export function newReceipt(c, now = new Date()) {
  binding(c);
  need(now < new Date(DEADLINE));
  return {
    version: 1,
    ...c,
    runId: randomUUID(),
    startedAt: now.toISOString(),
    deleteBy: DEADLINE,
    accessTokenLifetime: 'UNKNOWN',
    sharedRecords: [],
    visitedSurfaces: [],
    accounts: labels.map((label) => ({
      label,
      id: null,
      outcome: 'reserved',
      workspaces: [],
      residuals: null,
      loginOutcome: null,
      sessionRevocation: null,
      accessJwtResidual: null,
    })),
  };
}
export function validateReceipt(r, c) {
  keys(
    r,
    'version ack projectRef runId startedAt deleteBy accessTokenLifetime accounts sharedRecords visitedSurfaces'
  );
  binding({ ack: r.ack, projectRef: r.projectRef });
  need(r.version === 1 && isUuid(r.runId) && r.deleteBy === DEADLINE);
  need(Number.isFinite(Date.parse(r.startedAt)));
  need(Date.parse(r.startedAt) < Date.parse(DEADLINE));
  need(r.accessTokenLifetime === 'UNKNOWN');
  if (c) need(r.ack === c.ack && r.projectRef === c.projectRef);
  need(Array.isArray(r.accounts) && r.accounts.length === 2);
  need(Array.isArray(r.sharedRecords) && r.sharedRecords.length <= 1);
  need(Array.isArray(r.visitedSurfaces) && r.visitedSurfaces.length <= 128);
  for (const visit of r.visitedSurfaces) {
    keys(visit, 'label surface at');
    need(labels.includes(visit.label));
    safeSurface(visit.surface);
    need(
      Number.isFinite(Date.parse(visit.at)) &&
        Date.parse(visit.at) >= Date.parse(r.startedAt)
    );
  }
  const ids = new Set();
  for (const [i, a] of r.accounts.entries()) {
    keys(
      a,
      'label id outcome workspaces residuals loginOutcome sessionRevocation accessJwtResidual'
    );
    need(a.label === labels[i] && (a.id === null || isUuid(a.id)));
    const states =
      'reserved create-intent created ready login-intent login-ready login-failed delete-intent deleted unknown';
    need(states.split(' ').includes(a.outcome));
    need(a.id || ['reserved', 'create-intent', 'unknown'].includes(a.outcome));
    if (a.id) {
      need(!ids.has(a.id));
      ids.add(a.id);
    }
    need(Array.isArray(a.workspaces) && a.workspaces.length <= 1);
    for (const w of a.workspaces) {
      keys(w, 'id creatorId personal');
      need(isUuid(w.id) && w.creatorId === a.id && w.personal === true);
      need(!ids.has(w.id));
      ids.add(w.id);
    }
    need(
      [null, 'consumed', 'rejected', 'expired', 'stopped'].includes(
        a.loginOutcome
      )
    );
    need([null, 'auth-delete-cascade'].includes(a.sessionRevocation));
    need([null, 'access-jwt-valid-until-exp'].includes(a.accessJwtResidual));
    if (a.residuals !== null) {
      keys(a.residuals, 'users user_private_details platform_user_roles');
      need(Object.values(a.residuals).every((n) => n === 0 || n === 1));
    }
  }
  for (const w of r.sharedRecords) {
    keys(w, 'label id name');
    need(w.label === 'a1' && isUuid(w.id));
    need(w.name === 'QA D241');
    need(!ids.has(w.id));
  }
  return r;
}
export async function secureBytes(path, options = {}) {
  const { custodyOnly = false, opener = open } = options;
  const f = await opener(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await f.stat();
    need(s.isFile() && s.nlink === 1);
    if (custodyOnly)
      need(s.uid === process.getuid() && (s.mode & 0o777) === 0o600);
    need(s.size <= 131072);
    return await f.readFile();
  } finally {
    await f.close();
  }
}
export async function ancestors(path, custody = null) {
  if (custody) need(resolve(path).startsWith(`${resolve(custody)}/`));
  let p = dirname(resolve(path));
  while (true) {
    const s = await lstat(p);
    need(s.isDirectory() && !s.isSymbolicLink());
    if (
      custody &&
      (p === resolve(custody) || p.startsWith(`${resolve(custody)}/`))
    )
      need(s.uid === process.getuid() && (s.mode & 0o777) === 0o700);
    if (p === parse(p).root) break;
    p = dirname(p);
  }
}
export async function exclusive(path, bytes = 'intent') {
  const f = await open(path, 'wx', 0o600);
  try {
    await f.writeFile(bytes);
    await f.sync();
  } finally {
    await f.close();
  }
  const d = await open(dirname(path), 'r');
  try {
    await d.sync();
  } finally {
    await d.close();
  }
}
export async function receiptStore(path, { custody } = {}) {
  path = resolve(path);
  validateCustodyDirectory(custody);
  await ancestors(path, custody);
  const lock = await open(`${path}.lock`, 'wx', 0o600);
  let closed = false;
  let observed = null;
  const read = async () => {
    need(!closed);
    const bytes = await secureBytes(path, { custodyOnly: true });
    const record = validateReceipt(JSON.parse(bytes));
    observed = bytes;
    return record;
  };
  const write = (p, r) => {
    validateReceipt(r);
    return exclusive(p, JSON.stringify(r));
  };
  return {
    read,
    reserve: async (r) => {
      need(!closed);
      await write(path, r);
      observed = Buffer.from(JSON.stringify(r));
    },
    save: async (r) => {
      need(!closed);
      const before = await secureBytes(path, { custodyOnly: true });
      validateReceipt(JSON.parse(before));
      need(observed && observed.equals(before));
      const temp = `${path}.${randomUUID()}.tmp`;
      try {
        await write(temp, r);
        need(before.equals(await secureBytes(path, { custodyOnly: true })));
        await rename(temp, path);
        observed = Buffer.from(JSON.stringify(r));
        const d = await open(dirname(path), 'r');
        try {
          await d.sync();
        } finally {
          await d.close();
        }
      } catch {
        await unlink(temp).catch(() => {});
        throw new Error('RECEIPT_SAVE_FAILED');
      }
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await lock.close();
      await unlink(`${path}.lock`);
    },
  };
}
export function validateActionLink(value, ref) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error('LINK_SCOPE');
  }
  need(u.origin === `https://${ref}.supabase.co`);
  need(!u.username && !u.password && !u.hash);
  need(u.pathname === '/auth/v1/verify');
  need(u.searchParams.get('type') === 'magiclink');
  need(u.searchParams.get('redirect_to') === REDIRECT);
  need(
    Boolean(u.searchParams.get('token') || u.searchParams.get('token_hash'))
  );
  for (const k of u.searchParams.keys()) {
    need(['token', 'token_hash', 'type', 'redirect_to'].includes(k));
    need(u.searchParams.getAll(k).length === 1);
  }
  return u;
}
export async function startLoopbackSession({
  actionLink,
  projectRef,
  ttlMs = 300000,
}) {
  need(/^[a-z]{20}$/.test(projectRef));
  need(Number.isInteger(ttlMs) && ttlMs > 0 && ttlMs <= 300000);
  let destination = validateActionLink(actionLink, projectRef).href;
  let used = false;
  let finish;
  let timer;
  const closed = new Promise((r) => {
    finish = r;
  });
  const server = createServer((req, res) => {
    if (used) {
      res.writeHead(410).end();
      return;
    }
    used = true;
    const h = req.headers;
    const port = server.address()?.port;
    const valid =
      req.method === 'GET' &&
      req.url === '/' &&
      h.host === `127.0.0.1:${port}` &&
      !h.origin &&
      !h.cookie &&
      !h.authorization &&
      !h.purpose &&
      !h['sec-purpose'] &&
      h['sec-fetch-site'] === 'none' &&
      h['sec-fetch-dest'] === 'document' &&
      h['sec-fetch-mode'] === 'navigate';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Connection', 'close');
    if (valid) res.writeHead(302, { Location: destination });
    else res.writeHead(403);
    destination = '';
    res.end(() => server.closeAllConnections());
    server.close(() => {
      clearTimeout(timer);
      finish(valid ? 'consumed' : 'rejected');
    });
  });
  const stop = (outcome = 'stopped') => {
    used = true;
    destination = '';
    clearTimeout(timer);
    server.close(() => finish(outcome));
    server.closeAllConnections();
  };
  server.on('clientError', (_e, socket) => {
    socket.destroy();
    stop('rejected');
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxRequestsPerSocket = 1;
  await new Promise((yes, no) => {
    server.once('error', () => no(new Error('LOOPBACK_UNAVAILABLE')));
    server.listen(0, '127.0.0.1', yes);
  });
  timer = setTimeout(() => stop('expired'), ttlMs);
  return { port: server.address().port, closed, stop };
}
export function validateCustodyDirectory(value) {
  need(
    typeof value === 'string' && value.startsWith('/') && !value.includes('\0')
  );
  need(value !== '/' && resolve(value) === value);
  return value;
}
export function parseArgs(args) {
  const [flag, custody, receipt, command, ...rest] = args;
  need(flag === '--custody-directory');
  validateCustodyDirectory(custody);
  need(
    typeof receipt === 'string' &&
      receipt.startsWith('/') &&
      !receipt.includes('\0')
  );
  const counts = {
    execution: 0,
    cleanup: 0,
    status: 0,
    'record-workspace': 2,
    'record-visit': 2,
  };
  need(Object.hasOwn(counts, command) && rest.length === counts[command]);
  if (command === 'record-workspace') need(rest[0] === 'a1' && isUuid(rest[1]));
  if (command === 'record-visit')
    need(labels.includes(rest[0]) && safeSurface(rest[1]));
  return { custody, receipt, command, rest };
}
