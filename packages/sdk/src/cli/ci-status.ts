import type { RunsPage, WorkflowRun } from './ci-github';

export type CiState = 'success' | 'failure' | 'pending' | 'none';

export interface RunSummary {
  id: number;
  workflow: string;
  path?: string;
  event?: string;
  status: string;
  conclusion: string | null;
  attempt?: number;
  url?: string;
  updatedAt?: string;
}

export interface CiStatus {
  state: CiState;
  runs: RunSummary[];
  truncated: boolean;
}

const FAILED = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'startup_failure',
  'stale',
]);

function basename(path: string) {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function matchesWorkflow(run: WorkflowRun, filters: string[]) {
  if (filters.length === 0) return true;
  const name = (run.name ?? '').toLowerCase();
  const path = (run.path ?? '').split('@')[0] ?? '';
  return filters.some((filter) => {
    const wanted = filter.toLowerCase();
    return (
      wanted === name ||
      wanted === path.toLowerCase() ||
      wanted === basename(path).toLowerCase()
    );
  });
}

function runState(run: WorkflowRun): CiState {
  if (run.status !== 'completed') return 'pending';
  return FAILED.has(run.conclusion ?? '') ? 'failure' : 'success';
}

/** Latest run per workflow and event; a re-run keeps its id and bumps attempt. */
export function summarizeRuns(
  page: RunsPage,
  workflows: string[] = []
): CiStatus {
  const latest = new Map<string, WorkflowRun>();
  for (const run of page.workflow_runs ?? []) {
    if (!matchesWorkflow(run, workflows)) continue;
    const key = `${run.workflow_id ?? run.path ?? run.name}:${run.event ?? ''}`;
    const previous = latest.get(key);
    const newer =
      !previous ||
      (run.created_at ?? '') > (previous.created_at ?? '') ||
      ((run.created_at ?? '') === (previous.created_at ?? '') &&
        run.id > previous.id);
    if (newer) latest.set(key, run);
  }
  const runs = [...latest.values()]
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id - b.id)
    .map((run): RunSummary => ({
      id: run.id,
      workflow: run.name ?? run.path ?? String(run.workflow_id ?? run.id),
      path: run.path,
      event: run.event,
      status: run.status ?? 'unknown',
      conclusion: run.conclusion ?? null,
      attempt: run.run_attempt,
      url: run.html_url,
      updatedAt: run.updated_at,
    }));
  const states = [...latest.values()].map(runState);
  const state: CiState =
    states.length === 0
      ? 'none'
      : states.includes('failure')
        ? 'failure'
        : states.includes('pending')
          ? 'pending'
          : 'success';
  const total = page.total_count ?? 0;
  return {
    state,
    runs,
    truncated: total > (page.workflow_runs?.length ?? 0),
  };
}

export function renderStatus(
  repo: string,
  sha: string,
  status: CiStatus,
  meta: { source: string; stale: boolean; staleReason?: string }
) {
  const lines = [
    `${repo}@${sha.slice(0, 12)}  ${status.state.toUpperCase()}  (${meta.source}${meta.stale ? `, stale: ${meta.staleReason ?? 'unknown'}` : ''})`,
  ];
  for (const run of status.runs)
    lines.push(
      `  ${(run.conclusion ?? run.status).padEnd(16)} ${run.workflow}${run.event ? ` [${run.event}]` : ''}${run.attempt && run.attempt > 1 ? ` attempt ${run.attempt}` : ''}  ${run.url ?? ''}`
    );
  if (status.runs.length === 0) lines.push('  no matching workflow runs yet');
  if (status.truncated) lines.push('  (run list is incomplete for this SHA)');
  return lines.join('\n');
}
