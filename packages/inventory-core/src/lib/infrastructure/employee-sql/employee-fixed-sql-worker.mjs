import { createHash } from 'node:crypto';
import { Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import postgres from 'postgres';
import {
  CatalogSql,
  Command,
  isWorkerCommitLive,
  parseBounded,
  Signatures,
} from './employee-fixed-sql-protocol.mjs';

// Dedicated process and connection. No environment/URL/pool fallback or diagnostic output.
let session;
const bornAt = performance.now();
let commitExpiresAt;
let state = 'born';
let sql;
let connection;
let peerCertificateSha256;
const sockets = new Set();
const closed = [];
let retired = false;
let resolveAuthorization;
const timer = setTimeout(() => retire(), 13000);
function own(socket) {
  sockets.add(socket);
  socket.on('error', () => {});
  closed.push(
    new Promise((resolve) =>
      socket.once('close', () => {
        sockets.delete(socket);
        resolve();
      })
    )
  );
  return socket;
}
async function retire() {
  if (retired) return;
  retired = true;
  state = 'retired';
  clearTimeout(timer);
  resolveAuthorization?.(false);
  for (const socket of sockets) socket.destroy();
  await Promise.all(closed);
  if (process.connected) process.disconnect();
  process.exit(0);
}
function send(message) {
  if (!retired && process.connected)
    process.send(message, (error) => {
      if (error) void retire();
    });
}
function authorize(checkpoint) {
  state = checkpoint;
  return new Promise((resolve) => {
    resolveAuthorization = resolve;
  });
}
async function socketFor(database) {
  if (retired || sockets.size) throw new Error('Unavailable');
  const raw = own(new Socket());
  await new Promise((resolve, reject) => {
    raw.once('connect', resolve);
    raw.once('error', reject);
    raw.once('close', reject);
    raw.connect(database.port, database.host);
  });
  // PostgreSQL SSLRequest before any credentials or startup message.
  const request = Buffer.alloc(8);
  request.writeInt32BE(8);
  request.writeInt32BE(80877103, 4);
  await new Promise((resolve, reject) => {
    raw.once('data', (data) =>
      data.length === 1 && data[0] === 83
        ? resolve()
        : reject(new Error('Unavailable'))
    );
    raw.once('error', reject);
    raw.once('close', reject);
    raw.write(request);
  });
  const secure = own(
    connectTls({
      socket: raw,
      servername: database.host,
      rejectUnauthorized: true,
      ...(database.ca ? { ca: database.ca } : {}),
    })
  );
  await new Promise((resolve, reject) => {
    secure.once('secureConnect', resolve);
    secure.once('error', reject);
    secure.once('close', reject);
  });
  const certificate = secure.getPeerCertificate();
  if (!secure.authorized || !certificate.raw) throw new Error('Unavailable');
  peerCertificateSha256 = createHash('sha256')
    .update(certificate.raw)
    .digest('hex');
  if (retired) throw new Error('Unavailable');
  return secure;
}
async function catalog() {
  const rows = [];
  for (let index = 0; index < 4; index++)
    rows.push(await connection.unsafe(CatalogSql[index]));
  for (const signature of Signatures)
    rows.push(await connection.unsafe(CatalogSql[4], [signature]));
  return rows;
}
async function run(start) {
  session = start.session;
  state = 'starting';
  try {
    const database = start.database;
    sql = postgres({
      host: database.host,
      port: database.port,
      database: database.database,
      username: database.user,
      password: database.password,
      max: 1,
      prepare: false,
      connect_timeout: 5,
      fetch_types: false,
      ssl: false,
      socket: () => socketFor(database),
      onnotice: () => {},
      debug: false,
    });
    connection = await sql.reserve();
    await connection.unsafe('BEGIN');
    await connection.unsafe("SET LOCAL statement_timeout = '5s'");
    await connection.unsafe("SET LOCAL lock_timeout = '2s'");
    await connection.unsafe(
      "SET LOCAL idle_in_transaction_session_timeout = '5s'"
    );
    await connection.unsafe('SET LOCAL ROLE service_role');
    await connection.unsafe(
      `select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"service_role"}', true)`
    );
    const before = await catalog();
    const approved = authorize('before-effect');
    send({
      kind: 'catalog',
      session,
      checkpoint: 'before-effect',
      peerCertificateSha256,
      rows: before,
    });
    if (!(await approved) || retired) return;
    state = 'executing';
    const i = start.identity;
    const resultRows =
      start.phase === 'confirm'
        ? await connection.unsafe(
            'select private.confirm_employee_activation($1::uuid,$2::uuid,$3::text) as result',
            [i.actorUserId, i.userId, i.email]
          )
        : await connection.unsafe(
            start.phase === 'preflight'
              ? 'select private.employee_creation_preflight($1::uuid,$2::uuid,$3::text,$4::text) as result'
              : 'select private.finalize_employee_creation($1::uuid,$2::uuid,$3::text,$4::text) as result',
            [i.actorUserId, i.userId, i.email, i.displayName]
          );
    if (
      resultRows.length !== 1 ||
      Object.keys(resultRows[0]).join() !== 'result'
    )
      throw new Error('Unavailable');
    const after = await catalog();
    const commitApproved = authorize('before-commit');
    send({
      kind: 'catalog',
      session,
      checkpoint: 'before-commit',
      peerCertificateSha256,
      rows: after,
      result: resultRows[0].result,
    });
    if (!(await commitApproved) || retired) return;
    state = 'committing';
    // IPC acknowledgement must reach parent before COMMIT can be sent.
    const commit = authorize('committing');
    await new Promise((resolve, reject) =>
      process.send({ kind: 'committing', session }, (error) =>
        error ? reject(error) : resolve()
      )
    );
    if (
      !(await commit) ||
      retired ||
      !isWorkerCommitLive({
        expiresAt: commitExpiresAt,
        bornAt,
        now: Date.now(),
        monotonicNow: performance.now(),
      })
    )
      return;
    await connection.unsafe('COMMIT');
    await new Promise((resolve, reject) =>
      process.send(
        { kind: 'committed', session, result: resultRows[0].result },
        (error) => (error ? reject(error) : resolve())
      )
    );
  } catch {
    if (!['committing', 'commit-sent'].includes(state))
      send({ kind: 'aborted', session });
  } finally {
    await retire();
  }
}
process.on('message', (input) => {
  const message = parseBounded(Command, input);
  if (!message || (session && message.session !== session))
    return void retire();
  if (message.kind === 'start') {
    if (state !== 'born') return void retire();
    void run(message);
  } else if (message.kind === 'abort') void retire();
  else if (
    message.kind === 'commit' &&
    state === 'committing' &&
    resolveAuthorization
  ) {
    commitExpiresAt = message.expiresAt;
    if (
      !isWorkerCommitLive({
        expiresAt: commitExpiresAt,
        bornAt,
        now: Date.now(),
        monotonicNow: performance.now(),
      })
    )
      return void retire();
    const resolve = resolveAuthorization;
    resolveAuthorization = undefined;
    state = 'commit-sent';
    resolve(true);
  } else if (
    message.kind === 'authorize' &&
    state === message.checkpoint &&
    resolveAuthorization
  ) {
    const resolve = resolveAuthorization;
    resolveAuthorization = undefined;
    state = 'authorized';
    resolve(true);
  } else void retire();
});
process.on('disconnect', () => void retire());
process.on('SIGTERM', () => void retire());
