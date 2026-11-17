import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPOSITORY = 'tutur3u/platform';
const BASE = `https://api.github.com/repos/${REPOSITORY}/`;
const MAX_BODY = 4 * 1024 * 1024;
const guardErrors = new WeakSet();
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const shaValid = (value) =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const workflowValid = (value) =>
  typeof value === 'string' &&
  value.length <= 128 &&
  /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.ya?ml$/.test(value);

function refuse(phase) {
  const error = new Error(`CI_RECONCILER_GITHUB_GUARD:${phase}`);
  error.code = 'CI_RECONCILER_GITHUB_GUARD';
  error.phase = phase;
  guardErrors.add(error);
  throw error;
}
function requireValue(condition, phase) {
  if (!condition) refuse(phase);
}

function fencedPath(path, method) {
  requireValue(
    typeof path === 'string' &&
      path.length <= 2048 &&
      /^[a-zA-Z0-9_/?=&.,%-]+$/.test(path) &&
      !path.includes('..') &&
      !/%(?:2e|2f|5c)/i.test(path),
    'route'
  );
  const [pathname, query, extra] = path.split('?');
  requireValue(
    extra === undefined && (!query || /^[a-zA-Z0-9_=&.,%-]+$/.test(query)),
    'route'
  );
  if (method === 'GET') {
    requireValue(
      /^(?:git\/ref\/heads\/(?:main|production)|git\/commits\/[a-f0-9]{40}|actions(?:\/[a-zA-Z0-9_-]+(?:\.ya?ml)?)+)$/.test(
        pathname
      ),
      'route'
    );
  } else {
    requireValue(
      method === 'POST' &&
        !query &&
        (/^actions\/runs\/[1-9][0-9]*\/rerun$/.test(pathname) ||
          (/^actions\/workflows\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.ya?ml\/dispatches$/.test(
            pathname
          ) &&
            workflowValid(pathname.split('/')[2]))),
      'route'
    );
  }
}

async function readJson(response) {
  requireValue(
    [null, undefined, 'identity'].includes(
      response.headers?.get('content-encoding')
    ),
    'response-encoding'
  );
  const declared = response.headers?.get('content-length');
  requireValue(
    declared === null ||
      declared === undefined ||
      (/^[0-9]+$/.test(declared) && Number(declared) <= MAX_BODY),
    'response-size'
  );
  requireValue(
    /\bapplication\/(?:[a-z0-9.+-]*\+)?json\b/i.test(
      response.headers?.get('content-type') ?? ''
    ),
    'response-type'
  );
  requireValue(
    response.body && typeof response.body.getReader === 'function',
    'response-body'
  );
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        refuse('response-size');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  requireValue(
    declared === null || declared === undefined || Number(declared) === size,
    'response-truncated'
  );
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
    );
  } catch {
    refuse('response-json');
  }
}

function archiveReceipt(artifact, token, spawnImpl) {
  let directory;
  function execute(command, args, options, limit) {
    const result = spawnImpl(command, args, {
      shell: false,
      timeout: 5000,
      maxBuffer: limit,
      ...options,
    });
    requireValue(
      !result.error &&
        result.status === 0 &&
        !result.signal &&
        result.stdout &&
        Buffer.byteLength(result.stdout) <= limit,
      'archive-command'
    );
    return result.stdout;
  }
  try {
    const zip = execute(
      'gh',
      ['api', `repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`],
      {
        timeout: 10000,
        env: { ...process.env, GH_TOKEN: token, GH_HOST: 'github.com' },
      },
      512 * 1024
    );
    directory = mkdtempSync(join(tmpdir(), 'ci-reconcile-'));
    const path = join(directory, 'receipt.zip');
    writeFileSync(path, zip, { mode: 0o600, flag: 'wx' });
    const entries = execute('unzip', ['-Z1', path], {}, 4096).toString();
    requireValue(entries === 'receipt.json\n', 'archive-entries');
    const content = execute(
      'unzip',
      ['-p', path, 'receipt.json'],
      {},
      256 * 1024
    );
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(content)
    );
  } catch {
    refuse('archive');
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

function validateReceipt(receipt, { kind, branch, sha, source, artifact }) {
  requireValue(
    receipt &&
      receipt.schema === 1 &&
      receipt.kind === kind &&
      receipt.repository === REPOSITORY &&
      receipt.branch === branch &&
      receipt.sha === sha &&
      receipt.producerRunId === source.id &&
      receipt.producerRunId === artifact.workflow_run.id &&
      receipt.producerAttempt === source.run_attempt &&
      positive(receipt.producerAttempt) &&
      shaValid(receipt.controlSha) &&
      receipt.controlSha === source.head_sha &&
      Array.isArray(receipt.operations) &&
      receipt.operations.length <= 12,
    'receipt-identity'
  );
  const keys = new Set();
  for (const operation of receipt.operations) {
    requireValue(
      operation &&
        workflowValid(operation.workflow) &&
        positive(operation.attempt) &&
        operation.attempt <= 3 &&
        typeof operation.plannedAt === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(
          operation.plannedAt
        ) &&
        Number.isFinite(Date.parse(operation.plannedAt)) &&
        new Date(operation.plannedAt).toISOString().replace('.000Z', 'Z') ===
          operation.plannedAt.replace('.000Z', 'Z') &&
        ['planned', 'accepted', 'rejected', 'unknown'].includes(
          operation.status
        ) &&
        (operation.runId === undefined || positive(operation.runId)) &&
        (operation.baselineAttempt === undefined ||
          (positive(operation.baselineAttempt) && positive(operation.runId))),
      'receipt-operation'
    );
    const key = `${operation.workflow}:${operation.attempt}`;
    requireValue(!keys.has(key), 'receipt-duplicate');
    keys.add(key);
  }
  return receipt;
}

export function createGithub({
  token,
  fetchImpl = fetch,
  spawnImpl = spawnSync,
  now = Date.now,
  deadline = now() + 180000,
  decodeArtifact = (artifact) => archiveReceipt(artifact, token, spawnImpl),
} = {}) {
  requireValue(
    typeof token === 'string' &&
      token.trim().length > 0 &&
      !/[\r\n]/.test(token),
    'token'
  );
  async function request(relativePath, { method = 'GET', body } = {}) {
    fencedPath(relativePath, method);
    requireValue(
      Number.isSafeInteger(deadline) && now() < deadline,
      'deadline'
    );
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(10000, deadline - now())
    );
    let phase = 'request';
    try {
      requireValue(method !== 'GET' || body === undefined, 'request-body');
      const response = await fetchImpl(BASE + relativePath, {
        method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'Accept-Encoding': 'identity',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      phase = 'http';
      requireValue(response.ok === true, phase);
      if (response.status === 204) return null;
      phase = 'response';
      return await readJson(response);
    } catch (error) {
      if (guardErrors.has(error)) throw error;
      refuse(phase);
    } finally {
      clearTimeout(timer);
    }
  }
  async function readReceipts({ branch, sha, excludeRunId, workflowId }) {
    requireValue(
      ['main', 'production'].includes(branch) &&
        shaValid(sha) &&
        positive(excludeRunId) &&
        positive(workflowId),
      'receipt-input'
    );
    const receipts = [];
    for (const kind of ['intent', 'result']) {
      const name = `ci-reconcile-${kind}-${branch}-${sha}`;
      const listing = await request(
        `actions/artifacts?name=${name}&per_page=100`
      );
      requireValue(
        listing &&
          Number.isSafeInteger(listing.total_count) &&
          listing.total_count >= 0 &&
          listing.total_count <= 36 &&
          Array.isArray(listing.artifacts) &&
          listing.artifacts.length === listing.total_count,
        'artifact-list'
      );
      const ids = new Set();
      for (const artifact of listing.artifacts) {
        requireValue(
          artifact &&
            positive(artifact.id) &&
            !ids.has(artifact.id) &&
            artifact.name === name &&
            artifact.expired === false &&
            Number.isSafeInteger(artifact.size_in_bytes) &&
            artifact.size_in_bytes > 0 &&
            artifact.size_in_bytes <= 131072 &&
            positive(artifact.workflow_run?.id),
          'artifact'
        );
        ids.add(artifact.id);
        if (artifact.workflow_run.id === excludeRunId) continue;
        const source = await request(
          `actions/runs/${artifact.workflow_run.id}`
        );
        requireValue(
          source &&
            source.id === artifact.workflow_run.id &&
            source.workflow_id === workflowId &&
            source.head_branch === 'main' &&
            artifact.workflow_run.head_branch === 'main' &&
            artifact.workflow_run.head_sha === source.head_sha &&
            source.path === '.github/workflows/ci-reconciler.yaml' &&
            source.head_repository?.full_name === REPOSITORY &&
            shaValid(source.head_sha) &&
            positive(source.run_attempt),
          'artifact-producer'
        );
        let receipt;
        try {
          receipt = await decodeArtifact(artifact);
        } catch {
          refuse('artifact-decode');
        }
        receipts.push(
          validateReceipt(receipt, { kind, branch, sha, source, artifact })
        );
      }
    }
    return receipts;
  }
  return { request, readReceipts };
}
