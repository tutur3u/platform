import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const LOCAL_SHA256 =
  'ffe014af8d868abb1fdb347fd3ba8206f3420dea5edc03f9aa85324a8e0ecf6d';
const localUrl = new URL('./fleet-qa-local.mjs', import.meta.url);
const localFile = await open(
  localUrl,
  constants.O_RDONLY | constants.O_NOFOLLOW
);
try {
  const stat = await localFile.stat();
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    sha(await localFile.readFile()) !== LOCAL_SHA256
  )
    throw new Error('LOCAL_MODULE_REFUSED');
} finally {
  await localFile.close();
}
const local = await import(localUrl.href);
export const {
  ACCOUNTS,
  REDIRECT,
  DEADLINE,
  PROJECT_REF,
  EXEC_ACK,
  CLEAN_ACK,
  SCHEMA_SHA256,
  need,
  labels,
  isUuid,
  keys,
  binding,
  newReceipt,
  validateReceipt,
  secureBytes,
  ancestors,
  exclusive,
  receiptStore,
  validateActionLink,
  startLoopbackSession,
  parseArgs,
  validateCustodyDirectory,
} = local;
const residualFields = {
  users: 'id,display_name,avatar_url,banner_url,bio,handle',
  user_private_details: 'user_id,deleted,email,full_name,birthday,new_email',
  platform_user_roles: '*',
};
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
export async function call(op) {
  try {
    const r = await op();
    need(r && !r.error);
    return r.data;
  } catch {
    throw new Error('PROVIDER_FAILED');
  }
}
export function validateAck(a, e, now = Date.now()) {
  keys(
    a,
    'ackId helperSha256 moduleSha256 receiptSchemaSha256 projectRef custodyDirectory executor expiresAt labels oneUse securityAck reviewer'
  );
  for (const k of [
    'ackId',
    'helperSha256',
    'receiptSchemaSha256',
    'projectRef',
    'custodyDirectory',
  ])
    need(a[k] === e[k]);
  keys(a.moduleSha256, 'fleet-qa-local.mjs');
  need(a.moduleSha256['fleet-qa-local.mjs'] === LOCAL_SHA256);
  need(a.executor === 'Rex' && a.oneUse === true && a.securityAck === true);
  need(a.reviewer === 'Security Desk (Selene, D269)');
  need(
    typeof a.expiresAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?\+07:00$/.test(
        a.expiresAt
      )
  );
  need(
    Number.isFinite(Date.parse(a.expiresAt)) &&
      Date.parse(a.expiresAt) > now &&
      Date.parse(a.expiresAt) <= Date.parse(DEADLINE)
  );
  need(Array.isArray(a.labels) && a.labels.length > 0 && a.labels.length <= 2);
  need(
    new Set(a.labels).size === a.labels.length &&
      a.labels.every((l) => labels.includes(l))
  );
  need(e.labels.every((l) => a.labels.includes(l)));
  return () =>
    need(
      Date.parse(a.expiresAt) > Date.now() && Date.now() < Date.parse(DEADLINE)
    );
}
export async function admit(
  command,
  custody,
  read = secureBytes,
  reserve = exclusive
) {
  need(PROJECT_REF !== null);
  validateCustodyDirectory(custody);
  const origin = binding({ ack: EXEC_ACK, projectRef: PROJECT_REF });
  await ancestors(`${custody}/d241q-ack.json`);
  const dir = await lstat(custody);
  need(dir.isDirectory() && !dir.isSymbolicLink());
  need(dir.uid === process.getuid() && (dir.mode & 0o777) === 0o700);
  const helperSha256 = sha(
    await read(fileURLToPath(import.meta.url), { custodyOnly: true })
  );
  need(
    sha(await read(fileURLToPath(localUrl), { custodyOnly: true })) ===
      LOCAL_SHA256
  );
  const schema = await read(
    fileURLToPath(new URL('./fleet-qa-receipt.schema.json', import.meta.url)),
    { custodyOnly: true }
  );
  need(sha(schema) === SCHEMA_SHA256);
  const ackId = command === 'execution' ? EXEC_ACK : CLEAN_ACK;
  const a = JSON.parse(
    await read(`${custody}/d241q-ack.json`, { custodyOnly: true })
  );
  const authorize = validateAck(a, {
    ackId,
    helperSha256,
    receiptSchemaSha256: SCHEMA_SHA256,
    projectRef: PROJECT_REF,
    labels,
    custodyDirectory: custody,
  });
  authorize();
  let consumed = false;
  return {
    origin,
    authorize,
    consume: async () => {
      need(!consumed);
      await reserve(`${custody}/${ackId}.intent`);
      consumed = true;
      authorize();
    },
  };
}

export function assertDirectExecution(custody) {
  need(PROJECT_REF !== null);
  validateCustodyDirectory(custody);
  const self = fileURLToPath(import.meta.url);
  need(process.argv[1] && resolve(process.argv[1]) === self);
  need(process.execArgv.length === 0);
  need(self.startsWith(`${custody}/verified/`));
  need(!Object.hasOwn(process.env, 'NODE_OPTIONS'));
}

export function createGuardedFetch(
  origin,
  authorize,
  signal,
  supplier = fetch
) {
  return (input, init) => {
    authorize();
    need(!signal.aborted);
    const url = new URL(input instanceof Request ? input.url : input);
    need(url.origin === origin && !url.username && !url.password && !url.hash);
    return supplier(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.any(
        [signal, AbortSignal.timeout(15000), init?.signal].filter(Boolean)
      ),
    });
  };
}
export async function lookupEmail(fetcher, origin, secret, email) {
  need(Object.values(ACCOUNTS).includes(email));
  need(!/[%_\\\\\s]/.test(email));
  try {
    const url = new URL('/auth/v1/admin/users', origin);
    url.searchParams.set('filter', email);
    url.searchParams.set('per_page', '2');
    url.searchParams.set('page', '1');
    const response = await fetcher(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${secret}`, apikey: secret },
    });
    need(response.status === 200);
    const data = await response.json();
    need(Array.isArray(data?.users) && data.users.length <= 1);
    for (const user of data.users)
      need(user?.email === email && isUuid(user.id));
    return data.users.length === 1;
  } catch {
    throw new Error('ALIAS_LOOKUP_FAILED');
  }
}

function metadata(u, r) {
  const m = u.app_metadata;
  need(m?.qa === 'd241' && m.created_by === r.ack && m.qa_run_id === r.runId);
}
async function owned(c, r, a) {
  const d = await call(() => c.auth.admin.getUserById(a.id));
  const u = d?.user;
  need(u?.id === a.id && u.email === ACCOUNTS[a.label]);
  metadata(u, r);
  await normalRole(c, a.id);
}
const query = (c, t, fields, key, value) =>
  c.from(t).select(fields).eq(key, value);
async function rows(q, limit = 4) {
  const d = await call(() => q.limit(limit));
  need(Array.isArray(d) && d.length < limit);
  return d;
}
function checkRole(row, id) {
  need(row.user_id === id);
  for (const [key, value] of Object.entries(row)) {
    if (key === 'user_id') continue;
    if (['created_at', 'updated_at'].includes(key))
      need(value === null || Number.isFinite(Date.parse(value)));
    else need(value === false);
  }
}
async function normalRole(c, id) {
  const roles = await rows(
    query(c, 'platform_user_roles', '*', 'user_id', id),
    2
  );
  for (const role of roles) checkRole(role, id);
}
const workspaceFields = 'id,creator_id,personal,name,created_at';
const ws = (c, id) =>
  rows(query(c, 'workspaces', workspaceFields, 'id', id), 2);
const members = (c, id) =>
  rows(query(c, 'workspace_members', 'user_id,ws_id', 'ws_id', id));
const targets = (r, a) => [
  ...a.workspaces,
  ...(a.label === 'a1'
    ? r.sharedRecords.map((w) => ({
        id: w.id,
        personal: false,
      }))
    : []),
];
async function workspaceFence(c, r, a) {
  const all = targets(r, a);
  const own = await rows(query(c, 'workspaces', 'id', 'creator_id', a.id));
  const mem = await rows(
    query(c, 'workspace_members', 'ws_id', 'user_id', a.id)
  );
  need(
    own.length === all.length &&
      own.every((w) => all.some((t) => t.id === w.id))
  );
  need(
    mem.length === all.length &&
      mem.every((m) => all.some((t) => t.id === m.ws_id))
  );
  for (const t of all) await checkTarget(c, r, a, t);
}
async function checkTarget(c, r, a, t, afterAuthDeletion = false) {
  const list = await ws(c, t.id);
  need(list.length === 1);
  const w = list[0];
  need(w.id === t.id && w.creator_id === a.id && w.personal === t.personal);
  if (!t.personal) {
    const created = Date.parse(w.created_at);
    const named = typeof w.name === 'string' && w.name.includes('QA D241');
    need(a.label === 'a1' && named && created >= Date.parse(r.startedAt));
    need(created <= Date.now());
  }
  const mm = await members(c, t.id);
  if (afterAuthDeletion) need(t.personal && mm.length === 0);
  else need(mm.length === 1 && mm[0].user_id === a.id);
}

async function link(c, r, a) {
  await owned(c, r, a);
  const d = await call(() =>
    c.auth.admin.generateLink({
      type: 'magiclink',
      email: ACCOUNTS[a.label],
      options: { redirectTo: REDIRECT },
    })
  );
  need(d?.user?.id === a.id && d.user.email === ACCOUNTS[a.label]);
  metadata(d.user, r);
  validateActionLink(d.properties?.action_link, r.projectRef);
  need(/^[a-zA-Z0-9_-]{16,512}$/.test(d.properties?.hashed_token));
  return d.properties;
}
export function createHelper({
  client: c,
  config,
  store,
  now = () => new Date(),
  listener = startLoopbackSession,
  findAlias,
}) {
  const mark = async (r, a, s) => {
    a.outcome = s;
    await store.save(r);
  };
  async function ready(label) {
    need(labels.includes(label));
    const r = validateReceipt(await store.read(), config);
    const a = r.accounts[labels.indexOf(label)];
    need(['ready', 'login-ready', 'login-failed'].includes(a.outcome));
    await owned(c, r, a);
    await workspaceFence(c, r, a);
    return { r, a };
  }
  async function guarded(r, a, op, failure = 'unknown') {
    try {
      return await op();
    } catch {
      await mark(r, a, failure);
      throw new Error('STOP_RECONCILIATION_REQUIRED');
    }
  }
  return {
    async provision({ reserved = false } = {}) {
      const r = reserved
        ? validateReceipt(await store.read(), config)
        : newReceipt(config, now());
      need(r.accounts.every((a) => a.id === null && a.outcome === 'reserved'));
      if (!reserved) await store.reserve(r);
      for (const email of Object.values(ACCOUNTS)) {
        need(!(await findAlias(email)));
        need(
          (
            await rows(
              query(c, 'platform_email_roles', 'email', 'email', email),
              2
            )
          ).length === 0
        );
      }
      for (const a of r.accounts) {
        await mark(r, a, 'create-intent');
        await guarded(r, a, async () => {
          const display = local.DISPLAY_NAMES[a.label];
          const m = {
            qa: 'd241',
            created_by: r.ack,
            qa_run_id: r.runId,
            full_name: display,
            display_name: display,
          };
          const d = await call(() =>
            c.auth.admin.createUser({
              email: ACCOUNTS[a.label],
              email_confirm: true,
              app_metadata: m,
              user_metadata: m,
            })
          );
          need(isUuid(d?.user?.id));
          a.id = d.user.id;
          await mark(r, a, 'created');
          await owned(c, r, a);
          const list = await rows(
            query(c, 'workspaces', 'id,creator_id,personal', 'creator_id', a.id)
          );
          need(list.length === 1 && isUuid(list[0].id));
          need(list[0].personal === true && list[0].creator_id === a.id);
          a.workspaces = [{ id: list[0].id, creatorId: a.id, personal: true }];
          await store.save(r);
          await workspaceFence(c, r, a);
          await mark(r, a, 'ready');
        });
      }
    },
    async login(label) {
      const { r, a } = await ready(label);
      need(now() < new Date(DEADLINE));
      await mark(r, a, 'login-intent');
      return guarded(
        r,
        a,
        async () => {
          const prop = await link(c, r, a);
          const s = await listener({
            actionLink: prop.action_link,
            projectRef: r.projectRef,
          });
          try {
            await mark(r, a, 'login-ready');
          } catch {
            s.stop();
            throw new Error('SAVE');
          }
          return { label, outcome: 'ready', ...s };
        },
        'login-failed'
      );
    },
    async finishLogin(label, outcome) {
      need(labels.includes(label));
      need(['consumed', 'rejected', 'expired', 'stopped'].includes(outcome));
      const r = validateReceipt(await store.read(), config);
      const a = r.accounts[labels.indexOf(label)];
      need(a.outcome === 'login-ready');
      a.loginOutcome = outcome;
      await mark(r, a, outcome === 'consumed' ? 'login-ready' : 'login-failed');
    },
    async preflight() {
      for (const label of labels) await ready(label);
    },
    async delete(label) {
      const { r, a } = await ready(label);
      await mark(r, a, 'delete-intent');
      return guarded(r, a, async () => {
        await workspaceFence(c, r, a);
        for (const w of targets(r, a).filter((target) => !target.personal)) {
          await owned(c, r, a);
          await checkTarget(c, r, a, w);
          await call(() =>
            c.from('workspaces').delete().eq('id', w.id).eq('creator_id', a.id)
          );
          need((await ws(c, w.id)).length === 0);
        }
        await owned(c, r, a);
        await call(() => c.auth.admin.deleteUser(a.id));
        const absent = await c.auth.admin.getUserById(a.id);
        need(
          absent?.error?.code === 'user_not_found' &&
            absent.error.status === 404
        );
        need(!(await findAlias(ACCOUNTS[label])));
        a.sessionRevocation = 'auth-delete-cascade';
        a.accessJwtResidual = 'access-jwt-valid-until-exp';
        for (const w of a.workspaces) {
          const remaining = await ws(c, w.id);
          if (remaining.length) {
            await checkTarget(c, r, a, w, true);
            await call(() =>
              c
                .from('workspaces')
                .delete()
                .eq('id', w.id)
                .eq('creator_id', a.id)
            );
          }
          need((await ws(c, w.id)).length === 0);
        }
        need(
          (await rows(query(c, 'workspace_members', 'ws_id', 'user_id', a.id)))
            .length === 0
        );
        for (const w of targets(r, a)) need((await ws(c, w.id)).length === 0);
        const residuals = {};
        for (const [table, field] of [
          ['users', 'id'],
          ['user_private_details', 'user_id'],
          ['platform_user_roles', 'user_id'],
        ]) {
          const fields = residualFields[table];
          const list = await rows(query(c, table, fields, field, a.id), 2);
          for (const row of list) {
            const aliases = [
              null,
              label.toUpperCase(),
              ACCOUNTS[label],
              ACCOUNTS[label].split('@')[0],
              local.DISPLAY_NAMES[label],
            ];
            if (table === 'users') {
              need(aliases.includes(row.display_name));
              need(
                [row.avatar_url, row.banner_url, row.bio, row.handle].every(
                  (v) => v === null
                )
              );
            } else if (table === 'user_private_details') {
              need(
                row.deleted === true &&
                  [null, ACCOUNTS[label]].includes(row.email)
              );
              need(
                aliases.includes(row.full_name) &&
                  row.birthday === null &&
                  row.new_email === null
              );
            } else checkRole(row, a.id);
          }
          residuals[table] = list.length;
        }
        a.residuals = residuals;
        await mark(r, a, 'deleted');
        return {
          label,
          outcome: 'deleted',
          residuals: a.residuals,
        };
      });
    },
  };
}
export async function main(args) {
  const { custody, receipt, command } = parseArgs(args);
  need(['execution', 'cleanup'].includes(command));
  assertDirectExecution(custody);
  const store = await receiptStore(receipt, { custody });
  const config = { projectRef: PROJECT_REF, ack: EXEC_ACK };
  const sessions = [];
  const abort = new AbortController();
  const stop = () => sessions.forEach((session) => session.stop());
  const signal = () => {
    abort.abort();
    stop();
    process.exitCode = 1;
  };
  process.once('SIGINT', signal);
  process.once('SIGTERM', signal);
  try {
    if (command === 'execution') await store.reserve(newReceipt(config));
    else validateReceipt(await store.read(), config);
    const gate = await admit(command, custody);
    await gate.consume();
    need(process.env.NEXT_PUBLIC_SUPABASE_URL === gate.origin);
    const secret = process.env.SUPABASE_SECRET_KEY;
    need(secret);
    const require = createRequire(
      new URL('../../packages/supabase/package.json', import.meta.url)
    );
    const sdk = require.resolve('@supabase/supabase-js');
    need(resolve(sdk).startsWith(`${custody}/verified/`));
    const { createClient } = await import(pathToFileURL(sdk).href);
    const guardedFetch = createGuardedFetch(
      gate.origin,
      gate.authorize,
      abort.signal
    );
    const client = createClient(gate.origin, secret, {
      db: { retry: false },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: guardedFetch,
      },
    });
    const helper = createHelper({
      client,
      config,
      store,
      findAlias: (email) =>
        lookupEmail(guardedFetch, gate.origin, secret, email),
    });
    if (command === 'execution') {
      await helper.provision({ reserved: true });
      for (const label of labels) {
        const session = await helper.login(label);
        sessions.push(session);
        emit({ label, port: session.port, outcome: 'ready' });
      }
      for (const session of sessions)
        await helper.finishLogin(session.label, await session.closed);
    } else {
      await helper.preflight();
      for (const label of labels) emit(await helper.delete(label));
    }
  } finally {
    stop();
    process.removeListener('SIGINT', signal);
    process.removeListener('SIGTERM', signal);
    await store.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write(
      'STOP: preserve receipt for reviewed reconciliation.\n'
    );
    process.exitCode = 1;
  });
}
