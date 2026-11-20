import { DatabaseSync } from 'node:sqlite';
import { type Operation, runOperation } from './environment-service';
import type { EnvironmentName } from './projects';
import { type SqlExec, SqlEnvironmentStore } from './sql-store';
import { type EnvironmentStore, MemoryStore } from './store';
import type { CreateInput, Result } from './types';

// SQLite through node:sqlite with the Durable Object `exec` contract.
export function nodeSql(): SqlExec {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      const params = bindings as Array<string | number | null>;
      const rows =
        statement.columns().length > 0
          ? (statement.all(...params) as never[])
          : (statement.run(...params), []);
      return {
        toArray: () => rows,
        one: () => {
          if (rows.length !== 1) throw new Error('Expected exactly one row');
          return rows[0]!;
        },
      };
    },
  };
}

export const STORES: Array<[string, () => EnvironmentStore]> = [
  ['memory', () => new MemoryStore()],
  ['sqlite', () => new SqlEnvironmentStore(nodeSql())],
];

export function harness(
  makeStore: () => EnvironmentStore,
  environment: EnvironmentName = 'production',
  project = 'calendar'
) {
  const store = makeStore();
  let counter = 0;
  const newId = () => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`;
  };
  const call = <T = any>(operation: Operation, now: number): T => {
    const result: Result<unknown> = runOperation(
      store,
      (work) => work(),
      { project, environment },
      operation,
      now,
      newId
    );
    if (!result.ok)
      throw Object.assign(new Error(`${result.code}: ${result.message}`), {
        code: result.code,
      });
    return result.value as T;
  };
  const attempt = (operation: Operation, now: number) =>
    runOperation(
      store,
      (work) => work(),
      { project, environment },
      operation,
      now,
      newId
    );
  const deploy = (
    runId: number,
    now: number,
    overrides: Partial<CreateInput> = {}
  ) =>
    call<{ deployment: any; created: boolean }>(
      {
        op: 'create',
        input: {
          project,
          environment,
          lane: 'default',
          kind: 'deploy',
          sha: runId.toString(16).padStart(40, '0'),
          ref: 'refs/heads/production',
          plan: null,
          sourceDeploymentId: null,
          artifact: null,
          logsUrl: null,
          actor: 'github:ci',
          runId,
          idempotencyKey: `ci:${runId}:1:default`,
          bodyDigest: `digest-${runId}`,
          ...overrides,
        },
      },
      now
    ).deployment;
  const claim = (
    id: string,
    now: number,
    workerId = 'worker',
    runId: number | null = null
  ) => call({ op: 'claim', id, workerId, runId }, now);
  const complete = (
    id: string,
    grant: { attemptId: string; epoch: number },
    now: number,
    outcome: 'succeeded' | 'failed' = 'succeeded'
  ) =>
    call(
      {
        op: 'complete',
        id,
        runId: null,
        input: {
          grant,
          outcome,
          url: null,
          artifact: null,
          failureReason: null,
        },
      },
      now
    );
  return { store, call, attempt, deploy, claim, complete };
}

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

export const REPOSITORY_ID = '536896722';
export const AUDIENCE = 'tuturuuu-deploy-coordinator';

// A GitHub-shaped OIDC signer with a freshly generated RSA key.
export async function githubSigner(kid = 'test-key') {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const jwk = {
    ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    kid,
  };
  const sign = async (
    claims: Record<string, unknown> = {},
    header: Record<string, unknown> = { alg: 'RS256', kid }
  ) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://token.actions.githubusercontent.com',
      aud: AUDIENCE,
      exp: nowSeconds + 300,
      nbf: nowSeconds - 5,
      repository: 'tutur3u/platform',
      repository_id: REPOSITORY_ID,
      ref: 'refs/heads/production',
      sha: 'a'.repeat(40),
      run_id: '1000',
      run_attempt: '1',
      event_name: 'push',
      job_workflow_ref:
        'tutur3u/platform/.github/workflows/vercel-production-calendar.yaml@refs/heads/production',
      workflow_ref:
        'tutur3u/platform/.github/workflows/vercel-production.yaml@refs/heads/production',
      actor: 'release-bot',
      ...claims,
    };
    const body = `${encode(header)}.${encode(payload)}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(body)
    );
    return `${body}.${Buffer.from(signature).toString('base64url')}`;
  };
  return { jwk, sign };
}
