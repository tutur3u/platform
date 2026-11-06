import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { findLastSuccessfulDeploymentSha } from './github-deployment-markers.ts';

export type ChangedFilesResult = {
  available: boolean;
  baseSha?: string;
  files: string[];
  headSha?: string;
  reason?: string;
  source: string;
};

export type ResolveChangedFilesInput = {
  requireExplicitDeployment?: boolean;
  eventName?: string;
  eventPath?: string;
  headSha?: string;
  refName?: string;
  rootDir: string;
  workflowName?: string;
};

type PushCommit = {
  added?: string[];
  modified?: string[];
  removed?: string[];
};

type PushPayload = {
  after?: string;
  before?: string;
  commits?: PushCommit[];
  deleted?: boolean;
  size?: number;
};

type PullRequestPayload = {
  pull_request?: {
    base?: { sha?: string };
    head?: { sha?: string };
  };
};

const ZERO_SHA = /^0+$/;

function normalizeChangedPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function uniqueChangedFiles(files: string[]): string[] {
  return [
    ...new Set(
      files.map(normalizeChangedPath).filter((filePath) => filePath.length > 0)
    ),
  ].sort();
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    console.warn(
      `Unable to parse ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function readEventPayload<T>(eventPath?: string): T | null {
  const resolvedEventPath = eventPath ?? process.env.GITHUB_EVENT_PATH;

  return resolvedEventPath ? readJsonFile<T>(resolvedEventPath) : null;
}

function git(
  rootDir: string,
  args: string[],
  { allowFailure = false } = {}
): string | null {
  try {
    return execFileSync('git', ['-C', rootDir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', allowFailure ? 'ignore' : 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }

    throw error;
  }
}

function commitExists(rootDir: string, sha?: string): boolean {
  if (!sha || ZERO_SHA.test(sha)) {
    return false;
  }

  return (
    git(rootDir, ['cat-file', '-e', `${sha}^{commit}`], {
      allowFailure: true,
    }) !== null
  );
}

function isAncestor(
  rootDir: string,
  baseSha: string,
  headSha: string
): boolean {
  return (
    git(rootDir, ['merge-base', '--is-ancestor', baseSha, headSha], {
      allowFailure: true,
    }) !== null
  );
}

function getChangedFilesFromRange({
  baseSha,
  headSha,
  requireAncestor,
  source,
  rootDir,
}: {
  baseSha: string;
  headSha: string;
  requireAncestor: boolean;
  source: string;
  rootDir: string;
}): ChangedFilesResult {
  if (!commitExists(rootDir, baseSha) || !commitExists(rootDir, headSha)) {
    return {
      available: false,
      baseSha,
      files: [],
      headSha,
      reason: 'base or head commit is unavailable in the checkout',
      source,
    };
  }

  if (requireAncestor && !isAncestor(rootDir, baseSha, headSha)) {
    return {
      available: false,
      baseSha,
      files: [],
      headSha,
      reason: 'deployment marker is not an ancestor of the current commit',
      source,
    };
  }

  const output =
    git(rootDir, ['diff', '--name-only', '--no-renames', baseSha, headSha], {
      allowFailure: true,
    }) ?? '';

  return {
    available: true,
    baseSha,
    files: uniqueChangedFiles(output.split(/\r?\n/)),
    headSha,
    source,
  };
}

// Main pushes from squash/admin merges arrive with commits[] entries whose
// added/modified/removed lists are empty, so the payload alone reported zero
// paths and every affected-gated scan skipped. Diff the pushed before..after
// range first, use payload lists only when the range is not in the checkout,
// and fail open whenever a non-empty push still resolves to no paths.
function getPushPayloadFiles(
  payload: PushPayload | null,
  rootDir: string
): ChangedFilesResult {
  const headSha = payload?.after;
  const baseSha = payload?.before;
  const unavailable = (reason: string): ChangedFilesResult => ({
    available: false,
    baseSha,
    files: [],
    headSha,
    reason: `${reason}; affected gating must fail open`,
    source: 'push-payload',
  });

  if (!payload || payload.deleted) {
    return unavailable('push payload is unavailable or branch was deleted');
  }

  if (
    baseSha &&
    headSha &&
    commitExists(rootDir, baseSha) &&
    commitExists(rootDir, headSha)
  ) {
    const compared = getChangedFilesFromRange({
      baseSha,
      headSha,
      requireAncestor: false,
      rootDir,
      source: 'push-compare',
    });

    if (compared.available && compared.files.length > 0) {
      return compared;
    }
  }

  const commits = payload.commits ?? [];

  if (typeof payload.size === 'number' && payload.size > commits.length) {
    return unavailable('push payload commit list is truncated');
  }

  const changedFiles = uniqueChangedFiles(
    commits.flatMap((commit) => [
      ...(commit.added ?? []),
      ...(commit.modified ?? []),
      ...(commit.removed ?? []),
    ])
  );

  if (changedFiles.length === 0) {
    return unavailable(
      'push resolved no changed paths from the before..after range or payload'
    );
  }

  return {
    available: true,
    baseSha,
    files: changedFiles,
    headSha,
    source: `push-payload:${commits.length}-commit${
      commits.length === 1 ? '' : 's'
    }`,
  };
}

function getPullRequestRange({
  eventPath,
  rootDir,
}: {
  eventPath?: string;
  rootDir: string;
}): ChangedFilesResult {
  const payload = readEventPayload<PullRequestPayload>(eventPath);
  const baseSha = payload?.pull_request?.base?.sha;
  const headSha = payload?.pull_request?.head?.sha;

  if (!baseSha || !headSha) {
    return {
      available: false,
      baseSha,
      files: [],
      headSha,
      reason: 'pull request base/head SHA is unavailable',
      source: 'pull-request-range',
    };
  }

  return getChangedFilesFromRange({
    baseSha,
    headSha,
    requireAncestor: false,
    rootDir,
    source: 'pull-request-range',
  });
}

function isVercelWorkflow(workflowName?: string): workflowName is string {
  return /^vercel-(preview|production)-.+\.ya?ml$/.test(workflowName ?? '');
}

function isCloudflareProductionWorkflow(
  workflowName?: string
): workflowName is string {
  return /^(colab|coordination|cron-control|devbox-control|lettin|meet|parley)-cloudflare\.yaml$/.test(
    workflowName ?? ''
  );
}

function isSupabaseMigrationWorkflow(
  workflowName?: string
): workflowName is string {
  return /^supabase-(staging|production)\.ya?ml$/.test(workflowName ?? '');
}

export async function resolveChangedFiles({
  requireExplicitDeployment = false,
  eventName = process.env.GITHUB_EVENT_NAME,
  eventPath,
  headSha = process.env.GITHUB_SHA,
  refName = process.env.GITHUB_REF_NAME,
  rootDir,
  workflowName = process.env.WORKFLOW_NAME,
}: ResolveChangedFilesInput): Promise<ChangedFilesResult> {
  if (eventName === 'workflow_dispatch') {
    return {
      available: true,
      files: [],
      headSha,
      source: 'workflow_dispatch',
    };
  }

  const usesDeploymentMarkerRange =
    (eventName === 'push' &&
      (isVercelWorkflow(workflowName) ||
        isCloudflareProductionWorkflow(workflowName))) ||
    (eventName === 'workflow_run' && isSupabaseMigrationWorkflow(workflowName));

  if (usesDeploymentMarkerRange) {
    const markerSha = await findLastSuccessfulDeploymentSha({
      requireExplicitDeployment,
      refName,
      workflowName,
    });

    if (!markerSha) {
      return {
        available: false,
        files: [],
        headSha,
        reason:
          'no successful deployment marker is available; affected gating must fail open',
        source: 'deployment-marker-unavailable',
      };
    }

    if (!headSha) {
      return {
        available: false,
        baseSha: markerSha,
        files: [],
        reason:
          'the current commit is unavailable; affected gating must fail open',
        source: 'deployment-marker-unavailable',
      };
    }

    return getChangedFilesFromRange({
      baseSha: markerSha,
      headSha,
      requireAncestor: true,
      rootDir,
      source: 'deployment-marker',
    });
  }

  if (eventName === 'push') {
    return getPushPayloadFiles(
      readEventPayload<PushPayload>(eventPath),
      rootDir
    );
  }

  if (eventName === 'pull_request') {
    return getPullRequestRange({
      eventPath,
      rootDir,
    });
  }

  return {
    available: false,
    files: [],
    headSha,
    reason: `${eventName ?? 'unknown'} events do not expose a trusted change range`,
    source: 'unavailable',
  };
}
