import assert from 'node:assert/strict';
import { beforeEach, afterEach } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { aliasLockKey, payloadDigest } from './release-vercel-queue.mjs';
import { CALENDAR_VERCEL } from './release-vercel-config.mjs';
import { CALENDAR_RELEASE_IDENTITY } from './release-vercel-identity.mjs';
import {
  runningReleaseDigests,
  dispatchReleaseModeForTest,
} from './release-vercel-modes.mjs';
export const sha = 'a'.repeat(40);
const roots = [];
const markers = ['GITHUB_ACTIONS', 'GITHUB_EVENT_NAME'];
let saved;
beforeEach(() => {
  saved = markers.map((key) => process.env[key]);
  for (const key of markers) delete process.env[key];
});
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  markers.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key];
    else process.env[key] = saved[i];
  });
});
export function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vercel-release-'));
  roots.push(root);
  const app = join(root, 'apps/calendar'),
    output = join(app, '.vercel/output');
  mkdirSync(join(output, 'static/calendar/_next'), { recursive: true });
  writeFileSync(
    join(app, 'vercel.json'),
    JSON.stringify({ buildCommand: CALENDAR_VERCEL.buildCommand })
  );
  writeFileSync(
    join(app, '.vercel/.env.production.local'),
    `NEXT_PUBLIC_SUPABASE_URL=https://${CALENDAR_VERCEL.supabaseHost}\n`
  );
  writeFileSync(join(output, 'config.json'), JSON.stringify({ version: 3 }));
  writeFileSync(join(output, 'static/calendar/_next/app.js'), 'fixture');
  const state = {
    current: 'dpl_preimage',
    calls: [],
    receipts: {},
    time: 0,
    sequence: 0,
  };
  const target = {
    ...CALENDAR_RELEASE_IDENTITY,
    environment: 'vercel-stage-calendar',
  };
  const live = () => ({
    id: state.current,
    url: `https://${state.current}.vercel.app`,
    readyState: 'READY',
    projectId: target.project,
    aliases: [target.alias],
    commitSha: '9'.repeat(40),
    mainSha: '',
  });
  const candidate = {
    id: 'dpl_candidate',
    url: 'https://candidate.vercel.app',
    readyState: 'READY',
    projectId: target.project,
    aliases: [],
    commitSha: sha,
    mainSha: sha,
    outputSeal: '',
  };
  const stageTransport = {
    inspectAlias: async () => live(),
    pull: async () => {},
    build: async () => {},
    deploy: async (args) => {
      state.calls.push('stage-upload');
      candidate.outputSeal = args
        .find((v) => v.startsWith('outputSeal='))
        .slice('outputSeal='.length);
      return candidate;
    },
  };
  const provider = {
    inspectAlias: async () => live(),
    inspectDeployment: async (id) => ({
      id,
      projectId: target.project,
      readyState: 'READY',
      sourceSha: sha,
      outputSeal: state.receipts.stage?.artifactSha256 ?? '',
    }),
    setAlias: async ({ deploymentId }) => {
      state.calls.push('set-alias');
      state.current = deploymentId;
    },
  };
  let job, grant;
  const port = {
    claim: async (value) => {
      job = value;
      grant = {
        jobId: `job-${value.operationId}`,
        attemptId: 'attempt-1',
        workerId: 'worker-1',
        epoch: 1,
        targetLockId: 'lock-1',
        aliasLockKey: aliasLockKey(value.target),
        stopRevision: 0,
        leaseDeadline: 200,
        authorityNow: 100,
      };
      return grant;
    },
    renew: async () => grant,
    beginPhase: async () => {
      const phase = job.requestedPhases[0],
        predecessor =
          state.predecessorOverride ??
          state.receipts[phase === 'promote' ? 'stage' : 'promote'];
      return {
        status: 'running',
        predecessor,
        predecessorSha256: predecessor ? payloadDigest(predecessor) : undefined,
        approvalVerificationId: 'approval-verified',
        approval: {
          permission: phase === 'promote' ? 'rex-promote' : 'rollback',
          reference:
            phase === 'promote' ? 'rex-promote:fixture' : 'rollback:fixture',
          sourceSha: sha,
          environment: 'vercel-production-calendar',
          predecessorSha256: predecessor
            ? payloadDigest(predecessor)
            : undefined,
        },
      };
    },
    checkpoint: async (_grant, value) =>
      value.status === 'qualification-request'
        ? {
            status: 'running',
            lifecycleSha256: payloadDigest(value.lifecycle),
            qualification: {
              c1: 'passed',
              staticAuth: 'passed',
              delta: 'passed',
              qualification: 'passed',
            },
          }
        : { status: 'running' },
    finish: async (_grant, [receipt]) => {
      state.receipts[receipt.phase] = receipt;
      return { status: 'succeeded' };
    },
  };
  const hooks = {
    sourceRef: 'refs/heads/production',
    workspaceRoot: root,
    stageSource: async () => sha,
    verifySourceAncestry: async () => true,
    now: () => state.time,
    delay: async (ms) => {
      state.time += ms;
    },
  };
  function options(phase) {
    const predecessor =
      state.receipts[phase === 'promote' ? 'stage' : 'promote'];
    const payload = {
      schemaVersion: 1,
      jobType: 'vercel-release',
      operationId: `${phase}-${++state.sequence}`,
      repository: 'tutur3u/platform',
      sourceSha: sha,
      ...runningReleaseDigests('calendar'),
      target: {
        ...target,
        environment:
          phase === 'stage'
            ? 'vercel-stage-calendar'
            : 'vercel-production-calendar',
      },
      requestedPhases: [phase],
      requirements: {
        os: 'darwin',
        arch: 'arm64',
        toolchain: 'node24',
        capabilities: ['offline'],
        cpu: 1,
        ramMiB: 512,
        diskMiB: 512,
        maxDurationMs: 90000,
        infrastructureRetryLimit: 0,
      },
      authorizationRefs: [
        'environment:vercel-production-calendar',
        'rex-promote:fixture',
        'rollback:fixture',
      ],
      rollback: {
        deploymentId: 'dpl_preimage',
        authorizationRef: 'rollback:fixture',
      },
      provenance: { actor: 'fixture', thread: 'fixture' },
    };
    if (phase !== 'stage')
      payload.artifact = {
        id: predecessor?.candidate.id,
        sha256: predecessor?.artifactSha256,
      };
    return {
      port,
      payload,
      reviewedTarget: payload.target,
      receipt: predecessor,
      host: 'studio-offline',
      stageTransport,
      provider,
      probe: async () => ({
        smokeOk: true,
        errorRate: 0,
        sourceSha: sha,
        deploymentId: 'dpl_candidate',
      }),
    };
  }
  const run = async (phase, alter = (o) => o) =>
    dispatchReleaseModeForTest(alter(options(phase)), {
      ...hooks,
      sourceRef: phase === 'stage' ? 'refs/heads/main' : hooks.sourceRef,
    });
  return {
    state,
    port,
    hooks,
    options,
    run,
    provider,
    root,
    app,
    output,
    stageTransport,
  };
}
export async function promoted() {
  const f = fixture();
  assert.equal((await f.run('stage')).status, 'succeeded');
  assert.equal((await f.run('promote')).status, 'succeeded');
  return f;
}
