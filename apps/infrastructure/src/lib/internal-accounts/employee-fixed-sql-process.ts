import 'server-only';
import { fork } from 'node:child_process';
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  CatalogSql,
  Database,
  Identity,
  Message,
  normalizeSql,
  parseBounded,
  Signatures,
} from './employee-fixed-sql-protocol.mjs';
import {
  employeeCatalogRequirementsHash,
  employeeProjectBindingPayloadBytes,
  observeEmployeeSqlCatalog,
} from './employee-sql-catalog-readiness';

const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Qualification = z
  .object({
    kind: z.literal('qualified-fixed-worker'),
    workerSha256: Digest,
    protocolSha256: Digest,
    projectRef: z.string().regex(/^[a-z]{20}$/),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    deadlineMs: z.literal(15000),
    observedAt: z.number().finite(),
    expiresAt: z.number().finite(),
  })
  .strict();
const SignedQualification = z
  .object({ payload: Qualification, signature: z.string() })
  .strict();
const Binding = z
  .object({
    payload: z
      .object({
        projectRef: z.string(),
        qualifiedSourceSha: z.string(),
        requirementsHash: Digest,
        serverHost: z.string(),
      })
      .passthrough(),
    signature: z.string(),
  })
  .strict();
const Receipt = z
  .object({
    id: z.string().uuid(),
    email: z.string(),
    displayName: z.string(),
    status: z.enum(['pending', 'created']),
  })
  .strict();
export type FixedEmployeeSqlOutcome =
  | { kind: 'denied' }
  | { kind: 'aborted' }
  | { kind: 'commit_unknown' }
  | { kind: 'committed'; result: unknown };
const workerUrl = new URL('./employee-fixed-sql-worker.mjs', import.meta.url);
function signatureValid(key: string, bytes: Buffer, signature: string) {
  try {
    const publicKey = createPublicKey(key);
    return (
      publicKey.asymmetricKeyType === 'ed25519' &&
      verify(null, bytes, publicKey, Buffer.from(signature, 'base64'))
    );
  } catch {
    return false;
  }
}
/** Catalog admission cannot authorize a later COMMIT after its proof expires. */
export function isFixedEmployeeCommitFresh({
  signal,
  now,
  monotonicNow,
  deadlineAt,
  qualification,
  proof,
}: {
  signal: AbortSignal;
  now: number;
  monotonicNow: number;
  deadlineAt: number;
  qualification: Pick<
    z.infer<typeof Qualification>,
    'observedAt' | 'expiresAt'
  >;
  proof: { observedAt: number; expiresAt: number } | null;
}) {
  return (
    !signal.aborted &&
    proof !== null &&
    [
      now,
      monotonicNow,
      deadlineAt,
      qualification.observedAt,
      qualification.expiresAt,
      proof.observedAt,
      proof.expiresAt,
    ].every(Number.isFinite) &&
    monotonicNow < deadlineAt &&
    now >= qualification.observedAt &&
    now < qualification.expiresAt &&
    now >= proof.observedAt &&
    now < proof.expiresAt &&
    proof.expiresAt - proof.observedAt <= 60000
  );
}
/** Inert fixed-phase transport. External signed qualification/configuration is mandatory.
 * No HTTP adapter, provider, shared pool, arbitrary SQL or callback execution.
 * Child close bounds client descriptors; server rollback/lock drain is a separate gate.
 */
export async function executeFixedEmployeeSql({
  phase,
  identity,
  database,
  requirements,
  signedProjectBinding,
  executionQualification,
  trustedOperatorPublicKey,
}: {
  phase: 'preflight' | 'finalize' | 'confirm';
  identity: unknown;
  database: unknown;
  requirements: unknown;
  signedProjectBinding?: unknown;
  executionQualification?: unknown;
  trustedOperatorPublicKey?: string;
}): Promise<FixedEmployeeSqlOutcome> {
  const started = performance.now();
  const i = Identity.safeParse(identity),
    d = Database.safeParse(database);
  const q = SignedQualification.safeParse(executionQualification),
    b = Binding.safeParse(signedProjectBinding);
  if (
    !i.success ||
    !d.success ||
    !q.success ||
    !b.success ||
    !trustedOperatorPublicKey
  )
    return { kind: 'denied' };
  const now = Date.now();
  const bindingBytes = employeeProjectBindingPayloadBytes(b.data.payload);
  if (
    !bindingBytes ||
    !signatureValid(trustedOperatorPublicKey, bindingBytes, b.data.signature) ||
    !signatureValid(
      trustedOperatorPublicKey,
      Buffer.from(JSON.stringify(q.data.payload)),
      q.data.signature
    ) ||
    q.data.payload.observedAt > now ||
    q.data.payload.expiresAt <= now ||
    q.data.payload.expiresAt - q.data.payload.observedAt > 600000 ||
    q.data.payload.projectRef !== b.data.payload.projectRef ||
    q.data.payload.sourceSha !== b.data.payload.qualifiedSourceSha ||
    b.data.payload.requirementsHash !==
      employeeCatalogRequirementsHash(requirements) ||
    b.data.payload.serverHost !== d.data.host
  )
    return { kind: 'denied' };
  try {
    const bytes = await readFile(workerUrl);
    const protocolBytes = await readFile(
      new URL('./employee-fixed-sql-protocol.mjs', import.meta.url)
    );
    if (
      createHash('sha256').update(bytes).digest('hex') !==
        q.data.payload.workerSha256 ||
      createHash('sha256').update(protocolBytes).digest('hex') !==
        q.data.payload.protocolSha256 ||
      performance.now() - started >= 1000
    )
      return { kind: 'denied' };
  } catch {
    return { kind: 'denied' };
  }
  return new Promise((resolve) => {
    const session = randomUUID(),
      abort = new AbortController();
    const child = fork(workerUrl, [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
      env: { NODE_ENV: 'production' },
      serialization: 'json',
    });
    let state:
      | 'effect'
      | 'commit'
      | 'committing'
      | 'commit-sent'
      | 'committed'
      | 'retiring' = 'effect';
    let outcome: FixedEmployeeSqlOutcome = { kind: 'aborted' };
    let processing = false;
    let expectedResult: unknown;
    let commitProof: { observedAt: number; expiresAt: number } | null = null;
    const stop = () => {
      abort.abort();
      if (child.connected) child.send({ kind: 'abort', session }, () => {});
      child.kill('SIGTERM');
      state = 'retiring';
    };
    const soft = setTimeout(
      stop,
      Math.max(0, 13000 - (performance.now() - started))
    );
    const hard = setTimeout(
      () => {
        abort.abort();
        child.kill('SIGKILL');
      },
      Math.max(0, 14500 - (performance.now() - started))
    );
    child.once('error', () => {
      stop();
    });
    child.once('close', () => {
      clearTimeout(soft);
      clearTimeout(hard);
      abort.abort();
      resolve(outcome);
    });
    child.on('message', (input) => {
      const message = parseBounded(Message, input);
      if (!message || message.session !== session || processing) return stop();
      if (message.kind === 'catalog') {
        if (
          message.checkpoint !==
          (state === 'effect'
            ? 'before-effect'
            : state === 'commit'
              ? 'before-commit'
              : null)
        )
          return stop();
        processing = true;
        void (async () => {
          let cursor = 0;
          const observation = await observeEmployeeSqlCatalog({
            requirements,
            signedProjectBinding,
            trustedOperatorPublicKey,
            context: {
              signal: abort.signal,
              deadlineAt: started + 13000,
              serverHost: d.data.host,
              peerCertificateSha256: message.peerCertificateSha256,
              query: (strings, ...parameters) => {
                const text = normalizeSql(
                  strings.reduce(
                    (all, part, index) =>
                      all + (index ? `$${index}` : '') + part,
                    ''
                  )
                );
                const expected =
                  cursor < 4 ? CatalogSql[cursor] : CatalogSql[4];
                if (
                  !expected ||
                  text !== normalizeSql(expected) ||
                  (cursor < 4
                    ? parameters.length !== 0
                    : parameters.length !== 1 ||
                      parameters[0] !== Signatures[cursor - 4])
                )
                  throw new Error('Unavailable');
                const rows = message.rows[cursor++];
                if (!rows) throw new Error('Unavailable');
                return Promise.resolve(rows);
              },
            },
          });
          if (
            abort.signal.aborted ||
            observation.kind !== 'observed' ||
            cursor !== 7 ||
            Date.now() >= q.data.payload.expiresAt
          )
            return stop();
          if (state === 'commit') {
            const receipt = Receipt.safeParse(message.result);
            if (
              phase === 'preflight'
                ? message.result !== true
                : !receipt.success ||
                  receipt.data.id !== i.data.userId ||
                  receipt.data.email !== i.data.email ||
                  receipt.data.displayName !== i.data.displayName ||
                  receipt.data.status !==
                    (phase === 'finalize' ? 'pending' : 'created')
            )
              return stop();
          }
          if (state === 'commit') {
            expectedResult = message.result;
            commitProof = {
              observedAt: observation.proof.observedAt,
              expiresAt: observation.proof.expiresAt,
            };
          }
          state = state === 'effect' ? 'commit' : 'committing';
          processing = false;
          if (child.connected)
            child.send(
              { kind: 'authorize', session, checkpoint: message.checkpoint },
              (error) => {
                if (error) stop();
              }
            );
          else stop();
        })().catch(stop);
      } else if (message.kind === 'committing') {
        const proof = commitProof;
        if (
          !proof ||
          state !== 'committing' ||
          !isFixedEmployeeCommitFresh({
            signal: abort.signal,
            now: Date.now(),
            monotonicNow: performance.now(),
            deadlineAt: started + 13000,
            qualification: q.data.payload,
            proof,
          })
        )
          return stop();
        outcome = { kind: 'commit_unknown' };
        state = 'commit-sent';
        if (child.connected)
          child.send(
            {
              kind: 'commit',
              session,
              expiresAt: Math.min(q.data.payload.expiresAt, proof.expiresAt),
            },
            (error) => {
              if (error) stop();
            }
          );
        else stop();
      } else if (message.kind === 'committed') {
        if (
          state !== 'commit-sent' ||
          outcome.kind !== 'commit_unknown' ||
          JSON.stringify(message.result) !== JSON.stringify(expectedResult)
        )
          return stop();
        outcome = { kind: 'committed', result: message.result };
        state = 'committed';
      } else {
        if (state === 'committing' || state === 'commit-sent') return stop();
        outcome = { kind: 'aborted' };
        stop();
      }
    });
    child.send(
      { kind: 'start', session, phase, identity: i.data, database: d.data },
      (error) => {
        if (error) stop();
      }
    );
  });
}
