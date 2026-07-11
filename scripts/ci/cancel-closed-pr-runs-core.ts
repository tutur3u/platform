export const ACTIVE_RUN_STATUSES = [
  'queued',
  'in_progress',
  'waiting',
  'pending',
  'requested',
] as const;

const PROTECTED_PUSH_BRANCHES = new Set(['main', 'production']);

export type ActiveRunStatus = (typeof ACTIVE_RUN_STATUSES)[number];

type GitHubPullRequestReference = {
  head?: {
    ref?: string;
    repo?: { full_name?: string };
    sha?: string;
  };
  number?: number;
};

export type WorkflowRun = {
  event?: string;
  head_branch?: string | null;
  head_repository?: { full_name?: string } | null;
  head_sha?: string;
  id: number;
  name?: string;
  pull_requests?: GitHubPullRequestReference[];
  status?: string;
};

export type ActionsCache = {
  id: number;
  key?: string;
  ref?: string;
};

export type PullRequestCloseEvent = {
  action?: string;
  pull_request?: {
    head?: {
      ref?: string;
      repo?: { full_name?: string } | null;
      sha?: string;
    };
    number?: number;
  };
};

export type CancelClient = {
  cancelWorkflowRun(runId: number): Promise<{ status: number }>;
  listWorkflowRuns(input: {
    headSha: string;
    page: number;
    perPage: number;
    status: ActiveRunStatus;
  }): Promise<WorkflowRun[]>;
};

export type CacheClient = {
  deleteActionsCache(cacheId: number): Promise<{ status: number }>;
  listActionsCaches(input: {
    page: number;
    perPage: number;
    ref: string;
  }): Promise<ActionsCache[]>;
};

export type CancelSummary = {
  cancelled: number;
  considered: number;
  raceSkipped: number;
  skipped: number;
};

export type CacheCleanupSummary = {
  considered: number;
  deleted: number;
  raceSkipped: number;
};

type ClosedPullRequestContext = {
  headRef: string;
  headRepository: string;
  headSha: string;
  number: number;
};

type CancellationInput = {
  client: CancelClient;
  currentRunId?: number | string;
  event: PullRequestCloseEvent;
  log?: (message: string) => void;
  repository: string;
  statuses?: readonly ActiveRunStatus[];
};

type CacheCleanupInput = {
  client: CacheClient;
  event: PullRequestCloseEvent;
  log?: (message: string) => void;
};

function parsePositiveInteger(
  value: number | string | undefined
): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? ''), 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getClosedPullRequestContext(
  event: PullRequestCloseEvent
): ClosedPullRequestContext | null {
  if (event.action !== 'closed') {
    return null;
  }

  const pullRequest = event.pull_request;
  const number = pullRequest?.number;
  const headRef = pullRequest?.head?.ref;
  const headRepository = pullRequest?.head?.repo?.full_name;
  const headSha = pullRequest?.head?.sha;

  if (typeof number !== 'number' || !headRef || !headRepository || !headSha) {
    return null;
  }

  return { headRef, headRepository, headSha, number };
}

function isActiveRun(run: WorkflowRun): boolean {
  return ACTIVE_RUN_STATUSES.includes(run.status as ActiveRunStatus);
}

function pullRequestReferenceMatches(
  reference: GitHubPullRequestReference,
  pullRequest: ClosedPullRequestContext
): boolean {
  if (reference.number !== pullRequest.number) {
    return false;
  }

  const referenceHeadSha = reference.head?.sha;

  return !referenceHeadSha || referenceHeadSha === pullRequest.headSha;
}

function hasMatchingPullRequestReference(
  run: WorkflowRun,
  pullRequest: ClosedPullRequestContext
): boolean {
  return (
    run.pull_requests?.some((reference) =>
      pullRequestReferenceMatches(reference, pullRequest)
    ) ?? false
  );
}

function matchesPullRequestRun(
  run: WorkflowRun,
  pullRequest: ClosedPullRequestContext
): boolean {
  if (!['pull_request', 'pull_request_target'].includes(run.event ?? '')) {
    return false;
  }

  if (hasMatchingPullRequestReference(run, pullRequest)) {
    return true;
  }

  if ((run.pull_requests?.length ?? 0) > 0) {
    return false;
  }

  const runHeadRepository = run.head_repository?.full_name;

  return (
    run.head_branch === pullRequest.headRef &&
    (!runHeadRepository || runHeadRepository === pullRequest.headRepository)
  );
}

function matchesSameRepositoryPushRun({
  pullRequest,
  repository,
  run,
}: {
  pullRequest: ClosedPullRequestContext;
  repository: string;
  run: WorkflowRun;
}): boolean {
  if (run.event !== 'push' || pullRequest.headRepository !== repository) {
    return false;
  }

  if (!run.head_branch || PROTECTED_PUSH_BRANCHES.has(run.head_branch)) {
    return false;
  }

  return (
    run.head_branch === pullRequest.headRef &&
    run.head_repository?.full_name === repository
  );
}

export function shouldCancelWorkflowRun({
  currentRunId,
  pullRequest,
  repository,
  run,
}: {
  currentRunId?: number | string;
  pullRequest: ClosedPullRequestContext;
  repository: string;
  run: WorkflowRun;
}): boolean {
  if (parsePositiveInteger(currentRunId) === run.id) {
    return false;
  }

  if (!isActiveRun(run) || run.head_sha !== pullRequest.headSha) {
    return false;
  }

  return (
    matchesPullRequestRun(run, pullRequest) ||
    matchesSameRepositoryPushRun({ pullRequest, repository, run })
  );
}

async function listActiveRunsForPullRequest({
  client,
  headSha,
  statuses,
}: {
  client: CancelClient;
  headSha: string;
  statuses: readonly ActiveRunStatus[];
}): Promise<WorkflowRun[]> {
  const runs = new Map<number, WorkflowRun>();

  for (const status of statuses) {
    for (let page = 1; ; page += 1) {
      const pageRuns = await client.listWorkflowRuns({
        headSha,
        page,
        perPage: 100,
        status,
      });

      for (const run of pageRuns) {
        runs.set(run.id, run);
      }

      if (pageRuns.length < 100) {
        break;
      }
    }
  }

  return [...runs.values()].sort((a, b) => a.id - b.id);
}

function isCancellationRace(status: number): boolean {
  return status === 404 || status === 409;
}

function isSuccessfulCancellation(status: number): boolean {
  return status >= 200 && status < 300;
}

async function listPullRequestCaches({
  client,
  ref,
}: {
  client: CacheClient;
  ref: string;
}): Promise<ActionsCache[]> {
  const caches = new Map<number, ActionsCache>();

  for (let page = 1; ; page += 1) {
    const pageCaches = await client.listActionsCaches({
      page,
      perPage: 100,
      ref,
    });

    for (const cache of pageCaches) {
      caches.set(cache.id, cache);
    }

    if (pageCaches.length < 100) {
      break;
    }
  }

  return [...caches.values()].sort((a, b) => a.id - b.id);
}

export async function cleanupClosedPullRequestCaches({
  client,
  event,
  log = console.log,
}: CacheCleanupInput): Promise<CacheCleanupSummary> {
  const pullRequest = getClosedPullRequestContext(event);

  if (!pullRequest) {
    log('Event is not a closed pull request with complete head metadata.');
    return { considered: 0, deleted: 0, raceSkipped: 0 };
  }

  const ref = `refs/pull/${pullRequest.number}/merge`;
  const caches = await listPullRequestCaches({ client, ref });
  const summary: CacheCleanupSummary = {
    considered: caches.length,
    deleted: 0,
    raceSkipped: 0,
  };

  for (const cache of caches) {
    const response = await client.deleteActionsCache(cache.id);

    if (isSuccessfulCancellation(response.status)) {
      summary.deleted += 1;
      log(`Deleted Actions cache ${cache.id}: ${cache.key ?? '(unnamed)'}`);
      continue;
    }

    if (response.status === 404) {
      summary.raceSkipped += 1;
      log(`Skipped Actions cache ${cache.id}; it was already deleted.`);
      continue;
    }

    throw new Error(
      `Failed to delete Actions cache ${cache.id}: GitHub API returned ${response.status}.`
    );
  }

  log(
    `Closed PR #${pullRequest.number}: considered ${summary.considered} caches for ${ref}, deleted ${summary.deleted}, race-skipped ${summary.raceSkipped}.`
  );

  return summary;
}

export async function cancelClosedPullRequestRuns({
  client,
  currentRunId,
  event,
  log = console.log,
  repository,
  statuses = ACTIVE_RUN_STATUSES,
}: CancellationInput): Promise<CancelSummary> {
  const pullRequest = getClosedPullRequestContext(event);

  if (!pullRequest) {
    log('Event is not a closed pull request with complete head metadata.');
    return { cancelled: 0, considered: 0, raceSkipped: 0, skipped: 0 };
  }

  const activeRuns = await listActiveRunsForPullRequest({
    client,
    headSha: pullRequest.headSha,
    statuses,
  });
  const summary: CancelSummary = {
    cancelled: 0,
    considered: activeRuns.length,
    raceSkipped: 0,
    skipped: 0,
  };

  for (const run of activeRuns) {
    const shouldCancel = shouldCancelWorkflowRun({
      currentRunId,
      pullRequest,
      repository,
      run,
    });

    if (!shouldCancel) {
      summary.skipped += 1;
      continue;
    }

    const response = await client.cancelWorkflowRun(run.id);

    if (isSuccessfulCancellation(response.status)) {
      summary.cancelled += 1;
      log(`Cancelled workflow run ${run.id}: ${run.name ?? '(unnamed)'}`);
      continue;
    }

    if (isCancellationRace(response.status)) {
      summary.raceSkipped += 1;
      log(
        `Skipped workflow run ${run.id}; it finished before cancellation (${response.status}).`
      );
      continue;
    }

    throw new Error(
      `Failed to cancel workflow run ${run.id}: GitHub API returned ${response.status}.`
    );
  }

  log(
    `Closed PR #${pullRequest.number}: considered ${summary.considered}, cancelled ${summary.cancelled}, skipped ${summary.skipped}, race-skipped ${summary.raceSkipped}.`
  );

  return summary;
}
