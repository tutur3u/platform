import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
  lstatSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decideRecovery } from './ci-reconciler-plan.js';
import { createGithub } from './ci-reconciler-github.js';

const REPOSITORY = 'tutur3u/platform';
const CONTROL = '.github/workflows/ci-reconciler.yaml';
const SHA = /^[a-f0-9]{40}$/;
const SAFE_GATES = new Set([
  'type-check.yaml',
  'security-checks.yaml',
  'turbo-unit-tests.yaml',
  'codeql.yml',
  'oxc-check.yaml',
  'i18n-check.yaml',
  'codex-plugin.yaml',
  'required-account-mfa-contract.yaml',
]);
function guard(value, code) {
  if (!value) throw Object.assign(new Error(code), { code });
}
const positive = (value) => Number.isSafeInteger(value) && value > 0;

export function validatePolicy(policy) {
  guard(
    policy?.schema === 1 &&
      policy.repository === REPOSITORY &&
      typeof policy.recoveryEnabled === 'boolean' &&
      policy.maxAttempts === 3 &&
      JSON.stringify(policy.backoffSeconds) === '[60,300,900]' &&
      positive(policy.maxHeadAgeSeconds) &&
      policy.maxHeadAgeSeconds <= 20 * 86400 &&
      JSON.stringify(policy.branches) === '["main","production"]' &&
      Array.isArray(policy.gates) &&
      policy.gates.length === SAFE_GATES.size,
    'INVALID_POLICY'
  );
  const files = new Set();
  for (const gate of policy.gates) {
    guard(
      gate &&
        SAFE_GATES.has(gate.file) &&
        !files.has(gate.file) &&
        typeof gate.name === 'string' &&
        gate.name.length > 0 &&
        gate.name.length <= 120 &&
        !/[\r\n]/.test(gate.name) &&
        typeof gate.dispatch === 'boolean',
      'INVALID_GATE'
    );
    files.add(gate.file);
  }
  return policy;
}

export function trustedContext(env, controlSha) {
  guard(
    env.CI === 'true' &&
      env.GITHUB_REPOSITORY === REPOSITORY &&
      env.GITHUB_REF === 'refs/heads/main' &&
      env.RUNNER_ENVIRONMENT === 'github-hosted' &&
      env.RUNNER_OS === 'Linux' &&
      SHA.test(controlSha) &&
      env.GITHUB_SHA === controlSha &&
      env.GITHUB_WORKFLOW_SHA === controlSha &&
      env.GITHUB_WORKFLOW_REF === `${REPOSITORY}/${CONTROL}@refs/heads/main` &&
      ['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) &&
      /^[1-9][0-9]{0,14}$/.test(env.GITHUB_RUN_ID || '') &&
      /^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT || '') &&
      path.isAbsolute(env.RUNNER_TEMP || '') &&
      !/[\r\n\0]/.test(env.RUNNER_TEMP),
    'UNTRUSTED_CONTEXT'
  );
  return {
    controlSha,
    producerRunId: Number(env.GITHUB_RUN_ID),
    producerAttempt: Number(env.GITHUB_RUN_ATTEMPT),
  };
}

export function mergeReceipts(bundles, workflow) {
  const intents = new Map();
  const results = [];
  for (const bundle of bundles) {
    for (const operation of bundle.operations.filter(
      (item) => item.workflow === workflow
    )) {
      const key = `${bundle.producerRunId}:${bundle.producerAttempt}:${operation.attempt}`;
      if (bundle.kind === 'intent') {
        guard(
          !intents.has(key) && operation.status === 'planned',
          'DUPLICATE_INTENT'
        );
        intents.set(key, { ...operation });
      } else results.push([key, operation]);
    }
  }
  const seen = new Set();
  for (const [key, result] of results) {
    const intent = intents.get(key);
    guard(
      intent &&
        !seen.has(key) &&
        result.plannedAt === intent.plannedAt &&
        result.workflow === intent.workflow &&
        result.baselineAttempt === intent.baselineAttempt &&
        (intent.runId === undefined || intent.runId === result.runId),
      'RESULT_WITHOUT_INTENT'
    );
    seen.add(key);
    intents.set(key, { ...result });
  }
  const operations = [...intents.values()].sort(
    (a, b) => a.attempt - b.attempt
  );
  guard(operations.length <= 3, 'HISTORY_CAP');
  const attempts = new Set();
  for (const operation of operations) {
    guard(!attempts.has(operation.attempt), 'DUPLICATE_ATTEMPT');
    attempts.add(operation.attempt);
  }
  guard(
    operations.every((operation, index) => operation.attempt === index + 1),
    'INCOMPLETE_HISTORY'
  );
  return operations.map(
    ({ workflow: ignored, code: ignoredCode, ...receipt }) => receipt
  );
}

async function head(api, branch) {
  const result = await api.request(`git/ref/heads/${branch}`);
  guard(SHA.test(result?.object?.sha || ''), 'INVALID_HEAD');
  return result.object.sha;
}

async function gateRuns(api, gate, branch, sha) {
  const workflow = await api.request(`actions/workflows/${gate.file}`);
  guard(
    positive(workflow?.id) &&
      workflow.path === `.github/workflows/${gate.file}` &&
      workflow.name === gate.name,
    'WORKFLOW_IDENTITY'
  );
  const result = await api.request(
    `actions/workflows/${gate.file}/runs?branch=${branch}&head_sha=${sha}&per_page=100`
  );
  guard(
    Number.isSafeInteger(result?.total_count) &&
      result.total_count <= 100 &&
      Array.isArray(result.workflow_runs) &&
      result.workflow_runs.length === result.total_count,
    'RUN_HISTORY_INCOMPLETE'
  );
  guard(
    result.workflow_runs.every(
      (run) =>
        run.head_sha === sha &&
        run.head_branch === branch &&
        run.workflow_id === workflow.id &&
        run.head_repository?.full_name === REPOSITORY
    ),
    'RUN_IDENTITY'
  );
  return result.workflow_runs;
}

async function withinHistoryWindow(api, sha, policy, now) {
  const commit = await api.request(`git/commits/${sha}`);
  const time = Date.parse(commit?.committer?.date);
  return (
    commit?.sha === sha &&
    Number.isFinite(time) &&
    time <= now() &&
    now() - time <= policy.maxHeadAgeSeconds * 1000
  );
}

function receipt(context, kind, branch, sha, operations) {
  return {
    schema: 1,
    kind,
    repository: REPOSITORY,
    branch,
    sha,
    ...context,
    operations,
  };
}

export function summarize(branch, sha, outcomes, applied = []) {
  const terminal = outcomes.filter((item) => item.decision.kind === 'terminal');
  const missing = outcomes.length - terminal.length;
  const failed = terminal.filter(
    (item) =>
      !['success', 'skipped', 'neutral'].includes(item.decision.conclusion)
  ).length;
  const dispatched = applied.filter(
    (item) => item.status === 'accepted'
  ).length;
  return `HEAD ${sha}: ${outcomes.length} required, ${missing === 0 ? 'all terminal' : `${missing} missing (${dispatched} re-dispatched)`}; branch=${branch}; terminal-failed=${failed}; scope=core-v1`;
}

export async function summarizeApplied({
  api,
  policy,
  result,
  now = Date.now,
}) {
  validatePolicy(policy);
  guard(policy.branches.includes(result.branch), 'INVALID_BRANCH');
  const sha = await head(api, result.branch);
  const outcomes = [];
  for (const gate of policy.gates) {
    outcomes.push({
      workflow: gate.file,
      decision: decideRecovery({
        sha,
        workflow: gate,
        runs: await gateRuns(api, gate, result.branch, sha),
        receipts: [],
        now: now(),
      }),
    });
  }
  guard((await head(api, result.branch)) === sha, 'HEAD_ADVANCED');
  return summarize(
    result.branch,
    sha,
    outcomes,
    sha === result.sha ? result.operations : []
  );
}

export async function planReconciliation({
  api,
  policy,
  context,
  now = Date.now,
}) {
  validatePolicy(policy);
  const producer = await api.request(
    `actions/workflows/${path.basename(CONTROL)}`
  );
  guard(
    positive(producer?.id) && producer.path === CONTROL,
    'CONTROL_WORKFLOW'
  );
  const branches = [];
  for (const branch of policy.branches) {
    const sha = await head(api, branch);
    const observations = [];
    for (const gate of policy.gates)
      observations.push({ gate, runs: await gateRuns(api, gate, branch, sha) });
    const needsHistory = observations.some(
      ({ gate, runs }) =>
        !['terminal', 'dedupe'].includes(
          decideRecovery({
            sha,
            workflow: gate,
            runs,
            receipts: [],
            now: now(),
          }).kind
        )
    );
    const history = needsHistory
      ? await api.readReceipts({
          branch,
          sha,
          excludeRunId: context.producerRunId,
          workflowId: producer.id,
        })
      : [];
    const ageAllowed =
      !needsHistory || (await withinHistoryWindow(api, sha, policy, now));
    const outcomes = observations.map(({ gate, runs }) => {
      const decision = decideRecovery({
        sha,
        workflow: gate,
        runs,
        receipts: mergeReceipts(history, gate.file),
        now: now(),
        recoveryEnabled: policy.recoveryEnabled,
        maxAttempts: policy.maxAttempts,
        backoffSeconds: policy.backoffSeconds,
      });
      if (!ageAllowed && !['terminal', 'dedupe'].includes(decision.kind))
        return {
          workflow: gate.file,
          decision: { kind: 'blocked', code: 'HISTORY_WINDOW_EXPIRED' },
        };
      return { workflow: gate.file, decision };
    });
    guard((await head(api, branch)) === sha, 'HEAD_ADVANCED');
    const operations = outcomes
      .filter(({ decision }) => ['rerun', 'dispatch'].includes(decision.kind))
      .map(({ workflow, decision }) => {
        const operation = {
          workflow,
          attempt: decision.attempt,
          plannedAt: new Date(Math.floor(now() / 1000) * 1000).toISOString(),
          status: 'planned',
        };
        if (decision.kind === 'rerun') {
          const run = observations
            .find((item) => item.gate.file === workflow)
            .runs.find((item) => item.id === decision.runId);
          operation.runId = run.id;
          operation.baselineAttempt = run.run_attempt;
        }
        return operation;
      });
    branches.push({
      branch,
      sha,
      outcomes,
      intent: receipt(context, 'intent', branch, sha, operations),
    });
  }
  return {
    schema: 1,
    scope: 'core-v1',
    recoveryEnabled: policy.recoveryEnabled,
    branches,
  };
}

export async function applyReconciliation({
  api,
  policy,
  context,
  intent,
  saveResult,
  now = Date.now,
}) {
  validatePolicy(policy);
  guard(policy.recoveryEnabled, 'RECOVERY_DISABLED');
  guard(
    intent?.schema === 1 &&
      intent.kind === 'intent' &&
      intent.repository === REPOSITORY &&
      policy.branches.includes(intent.branch) &&
      SHA.test(intent.sha || '') &&
      intent.controlSha === context.controlSha &&
      intent.producerRunId === context.producerRunId &&
      intent.producerAttempt === context.producerAttempt &&
      Array.isArray(intent.operations) &&
      intent.operations.length <= policy.gates.length,
    'INVALID_INTENT'
  );
  const result = receipt(context, 'result', intent.branch, intent.sha, []);
  const producer = await api.request(
    `actions/workflows/${path.basename(CONTROL)}`
  );
  guard(
    positive(producer?.id) && producer.path === CONTROL,
    'CONTROL_WORKFLOW'
  );
  const seen = new Set();
  for (const operation of intent.operations) {
    guard(!seen.has(operation.workflow), 'DUPLICATE_OPERATION');
    seen.add(operation.workflow);
    const gate = policy.gates.find((item) => item.file === operation.workflow);
    guard(
      gate &&
        operation.status === 'planned' &&
        positive(operation.attempt) &&
        operation.attempt <= 3,
      'INVALID_OPERATION'
    );
    const entry = { ...operation, status: 'rejected' };
    result.operations.push(entry);
    saveResult(result);
    guard((await head(api, intent.branch)) === intent.sha, 'HEAD_ADVANCED');
    guard(
      await withinHistoryWindow(api, intent.sha, policy, now),
      'HISTORY_WINDOW_EXPIRED'
    );
    const runs = await gateRuns(api, gate, intent.branch, intent.sha);
    const history = await api.readReceipts({
      branch: intent.branch,
      sha: intent.sha,
      excludeRunId: context.producerRunId,
      workflowId: producer.id,
    });
    const decision = decideRecovery({
      sha: intent.sha,
      workflow: gate,
      runs,
      receipts: mergeReceipts(history, gate.file),
      now: now(),
      recoveryEnabled: true,
      maxAttempts: policy.maxAttempts,
      backoffSeconds: policy.backoffSeconds,
    });
    if (
      decision.attempt !== operation.attempt ||
      !['dispatch', 'rerun'].includes(decision.kind) ||
      decision.runId !== operation.runId
    ) {
      entry.code = 'DECISION_CHANGED';
      saveResult(result);
      continue;
    }
    guard((await head(api, intent.branch)) === intent.sha, 'HEAD_ADVANCED');
    // Persist uncertainty before the single provider call; never retry an unknown write.
    entry.status = 'unknown';
    saveResult(result);
    try {
      if (decision.kind === 'rerun')
        await api.request(`actions/runs/${decision.runId}/rerun`, {
          method: 'POST',
        });
      else
        await api.request(`actions/workflows/${gate.file}/dispatches`, {
          method: 'POST',
          body: { ref: intent.branch },
        });
      const after = await gateRuns(api, gate, intent.branch, intent.sha);
      const match =
        decision.kind === 'rerun'
          ? after.find(
              (run) =>
                run.id === operation.runId &&
                run.run_attempt > operation.baselineAttempt
            )
          : after.find(
              (run) =>
                run.event === 'workflow_dispatch' &&
                !runs.some((old) => old.id === run.id) &&
                Date.parse(run.created_at) >= Date.parse(operation.plannedAt)
            );
      if (match) {
        entry.status = 'accepted';
        entry.runId = match.id;
      } else entry.code = 'READBACK_PENDING';
    } catch {
      entry.code = 'WRITE_OR_READBACK_UNKNOWN';
    }
    saveResult(result);
  }
  return result;
}

function readBounded(file) {
  const stat = lstatSync(file);
  guard(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size > 0 &&
      stat.size <= 262144,
    'FILE_BOUND'
  );
  return JSON.parse(readFileSync(file, 'utf8'));
}
function writeJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
}
async function main() {
  const env = process.env;
  const policy = validatePolicy(
    readBounded(new URL('./ci-reconciler-policy.json', import.meta.url))
  );
  const controlSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  guard(
    env.CI === 'true' &&
      env.GITHUB_REPOSITORY === REPOSITORY &&
      env.GITHUB_REF === 'refs/heads/main' &&
      env.RUNNER_ENVIRONMENT === 'github-hosted' &&
      path.isAbsolute(env.RUNNER_TEMP || '') &&
      path.isAbsolute(env.GITHUB_EVENT_PATH || '') &&
      path
        .resolve(env.GITHUB_EVENT_PATH)
        .startsWith(`${path.resolve(env.RUNNER_TEMP)}${path.sep}`),
    'UNTRUSTED_CONTEXT'
  );
  const context = trustedContext(env, controlSha);
  const api = createGithub({ token: env.GH_TOKEN });
  const mode = process.argv[2];
  if (mode === 'plan') {
    const report = await planReconciliation({ api, policy, context });
    const selected = report.branches.filter(
      (item) => item.intent.operations.length
    );
    for (const item of report.branches) {
      const file = path.join(
        env.RUNNER_TEMP,
        'ci-reconciler',
        item.branch,
        'receipt.json'
      );
      if (item.intent.operations.length) writeJson(file, item.intent);
      appendFileSync(
        env.GITHUB_OUTPUT,
        `${item.branch}_sha=${item.sha}\n${item.branch}_intent=${item.intent.operations.length > 0}\n`
      );
      const line = summarize(item.branch, item.sha, item.outcomes);
      console.log(line);
      appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
    }
    writeJson(path.join(env.RUNNER_TEMP, 'ci-reconciler/report.json'), report);
    appendFileSync(
      env.GITHUB_OUTPUT,
      `has_actions=${selected.length > 0}\nmatrix=${JSON.stringify({ include: selected.map(({ branch, sha }) => ({ branch, sha })) })}\n`
    );
  } else if (mode === 'apply') {
    const branch = process.argv[3];
    guard(policy.branches.includes(branch), 'INVALID_BRANCH');
    const intent = readBounded(
      path.join(env.RUNNER_TEMP, 'ci-reconciler-input', branch, 'receipt.json')
    );
    const result = await applyReconciliation({
      api,
      policy,
      context,
      intent,
      saveResult: (value) =>
        writeJson(
          path.join(
            env.RUNNER_TEMP,
            'ci-reconciler-result',
            branch,
            'receipt.json'
          ),
          value
        ),
    });
    const line = await summarizeApplied({ api, policy, result });
    console.log(line);
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`);
  } else guard(false, 'INVALID_MODE');
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    const code = /^[A-Z_]+$/.test(error.code || error.message)
      ? error.code || error.message
      : 'STOP';
    console.error(
      JSON.stringify({
        code: `CI_RECONCILER_${code}`,
        phase: error.phase || 'controller',
      })
    );
    process.exitCode = 1;
  });
}
