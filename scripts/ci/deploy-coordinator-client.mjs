// GitHub Actions client for the deployment coordinator
// (apps/docs/build/devops/deployment-coordinator.mdx). Phases:
//   begin     register the deploy job, wait for a grant, start a heartbeat
//   check     before a provider effect: fail in enforce mode if the lease lapsed
//   finish    stop the heartbeat and report the job outcome
//   heartbeat internal background loop started by begin
// DEPLOY_COORDINATOR_MODE selects off (default), observe or enforce. Every
// coordinator failure falls open: publishing proceeds as without it.
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

export const AUDIENCE = 'tuturuuu-deploy-coordinator';
export const LIMITS = {
  attempts: 3,
  minPollSeconds: 20,
  maxPollSeconds: 60,
  heartbeatSeconds: 60,
  maxHeartbeatMinutes: 90,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function readConfig(env) {
  const mode = ['observe', 'enforce'].includes(env.DEPLOY_COORDINATOR_MODE)
    ? env.DEPLOY_COORDINATOR_MODE
    : 'off';
  const maxWait = Number.parseInt(env.DC_MAX_WAIT_MINUTES || '30', 10);
  return {
    mode,
    origin: (env.DEPLOY_COORDINATOR_ORIGIN || '').replace(/\/+$/, ''),
    project: env.DC_PROJECT || '',
    environment: env.DC_ENVIRONMENT || '',
    lane: env.DC_LANE || '',
    sha: env.DC_SHA || '',
    plan: env.DC_PLAN_DIGEST
      ? {
          source: env.DC_PLAN_SOURCE || 'affected-planner',
          digest: env.DC_PLAN_DIGEST,
          url: env.DC_PLAN_URL || null,
        }
      : null,
    maxWaitMs: clamp(Number.isFinite(maxWait) ? maxWait : 30, 1, 60) * 60_000,
    jobStatus: env.DC_JOB_STATUS || '',
    url: env.DC_URL || null,
    artifact: env.DC_ARTIFACT_ID
      ? {
          kind: env.DC_ARTIFACT_KIND || 'provider',
          id: env.DC_ARTIFACT_ID,
          digest: env.DC_ARTIFACT_DIGEST || null,
        }
      : null,
    stateFile:
      env.DC_STATE_FILE ||
      `${env.RUNNER_TEMP || '/tmp'}/deploy-coordinator-${env.DC_PROJECT}-${env.DC_ENVIRONMENT}.json`,
    workerId: `${env.GITHUB_RUN_ID || 'local'}:${env.GITHUB_RUN_ATTEMPT || '1'}:${env.GITHUB_JOB || 'job'}`,
  };
}

export function createClient({ env, fetch, sleep, log }) {
  const config = readConfig(env);
  const base = `${config.origin}/v1/projects/${encodeURIComponent(config.project)}/environments/${encodeURIComponent(config.environment)}`;

  async function idToken() {
    const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const bearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!url || !bearer) return null;
    const response = await request(
      `${url}${url.includes('?') ? '&' : '?'}audience=${AUDIENCE}`,
      { method: 'GET', headers: { Authorization: `Bearer ${bearer}` } }
    );
    return response.ok && typeof response.body?.value === 'string'
      ? response.body.value
      : null;
  }

  // Retries network failures and 5xx only, a bounded number of times.
  async function request(url, init) {
    let last = { ok: false, status: 0, body: null };
    for (let attempt = 1; attempt <= LIMITS.attempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(15_000),
        });
        const text = await response.text();
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = null;
        }
        last = { ok: response.ok, status: response.status, body };
        if (response.status < 500) return last;
      } catch (error) {
        last = { ok: false, status: 0, body: { error: String(error) } };
      }
      if (attempt < LIMITS.attempts) await sleep(1_000 * 2 ** (attempt - 1));
    }
    return last;
  }

  async function post(path, body) {
    const token = await idToken();
    if (!token) return { ok: false, status: 0, body: { error: 'NO_ID_TOKEN' } };
    return request(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  return { config, post, log };
}

const describe = (response) =>
  `${response.status} ${response.body?.error ?? ''} ${response.body?.message ?? ''}`.trim();

// Returns { publish, deploymentId, grant }. publish is false only in enforce
// mode when the coordinator durably answered superseded, held or terminal.
export async function begin(
  client,
  { now, sleep, startHeartbeat, writeState }
) {
  const { config, post, log } = client;
  const proceed = (reason, deploymentId = '') => {
    if (reason) log(`Deploy coordinator: ${reason}; publishing without it.`);
    return { publish: true, deploymentId, grant: null };
  };
  if (config.mode === 'off') return proceed('');
  if (!/^https:\/\/[^/]+/.test(config.origin))
    return proceed('DEPLOY_COORDINATOR_ORIGIN is not an https origin');
  if (!config.project || !config.environment)
    return proceed('project and environment inputs are required');
  const enforce = config.mode === 'enforce';

  const body = { plan: config.plan };
  if (config.environment === 'preview') {
    body.sha = config.sha;
    body.lane = config.lane;
  }
  const created = await post('/deployments', body);
  if (!created.ok) return proceed(`registration failed (${describe(created)})`);
  const deployment = created.body.deployment;
  const id = deployment.id;
  log(`Deploy coordinator: registered ${id} (${deployment.status}).`);
  const skip = (decision) => {
    log(
      `Deploy coordinator: ${decision}; ${enforce ? 'skipping publication' : 'observe mode publishes anyway'}.`
    );
    return { publish: !enforce, deploymentId: id, grant: null };
  };
  if (deployment.status === 'superseded')
    return skip('superseded by a newer run');

  // Publishing without a grant closes the registered deployment first, so the
  // coordinator never shows it queued after an uncoordinated publish.
  const uncoordinated = async (reason) => {
    await post(`/deployments/${id}/skip`, {
      reason: 'PUBLISHED_UNCOORDINATED',
    });
    return proceed(reason, id);
  };

  const deadline = now() + config.maxWaitMs;
  for (;;) {
    const claimed = await post(`/deployments/${id}/claim`, {
      workerId: config.workerId,
    });
    if (!claimed.ok) return proceed(`claim failed (${describe(claimed)})`, id);
    const answer = claimed.body;
    if (answer.decision === 'granted') {
      writeState({
        deploymentId: id,
        grant: answer.grant,
        base: config.origin,
      });
      startHeartbeat();
      log(
        `Deploy coordinator: granted epoch ${answer.grant.epoch} until ${answer.grant.leaseDeadline}.`
      );
      return { publish: true, deploymentId: id, grant: answer.grant };
    }
    if (answer.decision === 'superseded')
      return skip('superseded by a newer run');
    if (answer.decision === 'terminal')
      return skip(`deployment is ${answer.status}`);
    if (answer.decision === 'held') {
      if (!enforce) return uncoordinated('lane is held after a rollback');
      await post(`/deployments/${id}/skip`, { reason: 'SKIPPED_HELD' });
      return skip('lane is held after a rollback');
    }
    // wait or stopped
    if (!enforce) return uncoordinated(`lane busy (${answer.decision})`);
    const delay =
      clamp(
        answer.retryAfterSeconds ?? 20,
        LIMITS.minPollSeconds,
        LIMITS.maxPollSeconds
      ) * 1000;
    if (now() + delay > deadline)
      return uncoordinated(`still ${answer.decision} after the wait limit`);
    log(
      `Deploy coordinator: ${answer.decision}; retrying in ${delay / 1000}s.`
    );
    await sleep(delay);
  }
}

// Background loop: extends the lease until finish removes the state file, the
// lease is refused, or the attempt ceiling passes. A refusal is recorded so
// `check` can fence later provider effects.
export async function heartbeat(client, { now, sleep, readState, markFenced }) {
  const started = now();
  for (;;) {
    await sleep(LIMITS.heartbeatSeconds * 1000);
    const state = readState();
    if (!state) return 'finished';
    if (now() - started > LIMITS.maxHeartbeatMinutes * 60_000) return 'ceiling';
    const response = await client.post(
      `/deployments/${state.deploymentId}/heartbeat`,
      {
        grant: { attemptId: state.grant.attemptId, epoch: state.grant.epoch },
      }
    );
    if (response.status === 409 || response.status === 403) {
      markFenced(response.body?.error ?? 'REFUSED');
      return 'fenced';
    }
  }
}

export async function finish(
  client,
  { readState, removeState, stopHeartbeat }
) {
  const state = readState();
  stopHeartbeat(state);
  removeState();
  if (!state) return null;
  const outcome =
    client.config.jobStatus === 'success' ? 'succeeded' : 'failed';
  const response = await client.post(
    `/deployments/${state.deploymentId}/complete`,
    {
      grant: { attemptId: state.grant.attemptId, epoch: state.grant.epoch },
      outcome,
      url: client.config.url,
      artifact: client.config.artifact,
      failureReason: outcome === 'failed' ? 'JOB_FAILED' : null,
    }
  );
  client.log(
    response.ok
      ? `Deploy coordinator: recorded ${outcome}.`
      : `Deploy coordinator: completion not recorded (${describe(response)}).`
  );
  return outcome;
}

async function main(phase) {
  const env = process.env;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const client = createClient({
    env,
    fetch,
    sleep,
    log: (line) => console.log(line),
  });
  const { stateFile } = client.config;
  const fencedFile = `${stateFile}.fenced`;
  const readState = () =>
    existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
  const output = (name, value) => {
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
  };
  if (phase === 'begin') {
    const result = await begin(client, {
      now: Date.now,
      sleep,
      writeState: (state) =>
        writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 }),
      startHeartbeat: () => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(import.meta.url), 'heartbeat'],
          {
            detached: true,
            stdio: 'ignore',
            env,
          }
        );
        child.unref();
        const state = readState();
        writeFileSync(stateFile, JSON.stringify({ ...state, pid: child.pid }), {
          mode: 0o600,
        });
      },
    });
    output('publish', String(result.publish));
    output('deployment-id', result.deploymentId);
  } else if (phase === 'heartbeat') {
    await heartbeat(client, {
      now: Date.now,
      sleep,
      readState,
      markFenced: (code) => writeFileSync(fencedFile, code),
    });
  } else if (phase === 'check') {
    if (!existsSync(fencedFile)) return;
    const code = readFileSync(fencedFile, 'utf8');
    const message = `Deploy coordinator refused the lease (${code}); do not start a provider effect.`;
    if (client.config.mode === 'enforce') {
      console.error(message);
      process.exitCode = 1;
    } else console.log(`${message} Observe mode continues.`);
  } else if (phase === 'finish') {
    if (client.config.mode === 'off') return;
    await finish(client, {
      readState,
      removeState: () => rmSync(stateFile, { force: true }),
      stopHeartbeat: (state) => {
        rmSync(fencedFile, { force: true });
        if (state?.pid) {
          try {
            process.kill(state.pid);
          } catch {
            // Already exited.
          }
        }
      },
    });
  } else {
    throw new Error(`Unknown phase ${phase}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => {
    // Fall open: a coordinator client failure never fails the deploy job.
    console.log(`Deploy coordinator client error: ${error?.message ?? error}`);
    if (process.argv[2] === 'begin' && process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, 'publish=true\n');
  });
}
