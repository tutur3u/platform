const shaPattern = /^[0-9a-f]{40}$/;
export const repoPattern = /^[a-z0-9_-]+\/[a-z0-9_.-]+$/;

export function validRepo(repo: string) {
  return (
    repoPattern.test(repo) && !repo.endsWith('/.') && !repo.endsWith('/..')
  );
}

export function validSha(sha: string) {
  return shaPattern.test(sha) && sha !== '0'.repeat(40);
}

function fields(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 160) {
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

function id(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

export interface EventProjection {
  key: string;
  kind:
    | 'workflow_run'
    | 'workflow_job'
    | 'check_suite'
    | 'pull_request'
    | 'push';
  sha: string;
  updated: number;
  data: Record<string, string | number | boolean | null | undefined>;
}

export function projectRun(value: unknown): EventProjection | undefined {
  const run = fields(value);
  const runId = id(run.id);
  const sha = text(run.head_sha, 40);
  const updated = Date.parse(text(run.updated_at) ?? '');
  if (!runId || !sha || !validSha(sha) || !Number.isFinite(updated))
    return undefined;
  return {
    key: `run:${runId}`,
    kind: 'workflow_run',
    sha,
    updated,
    data: {
      id: runId,
      workflow_id: id(run.workflow_id),
      name: text(run.name),
      path: text(run.path, 256),
      event: text(run.event),
      status: text(run.status),
      conclusion: text(run.conclusion) ?? null,
      run_attempt: id(run.run_attempt),
      created_at: text(run.created_at),
      updated_at: text(run.updated_at),
    },
  };
}

export function projectDelivery(event: string, body: unknown) {
  const payload = fields(body);
  const repo = text(fields(payload.repository).full_name)?.toLowerCase();
  if (!repo || !validRepo(repo)) return undefined;
  let projection: EventProjection | undefined;
  if (event === 'workflow_run') {
    projection = projectRun(payload.workflow_run);
  } else if (event === 'push') {
    const sha = text(payload.after, 40);
    if (sha && validSha(sha))
      projection = {
        key: `push:${sha}`,
        kind: 'push',
        sha,
        updated: 0,
        data: { ref: text(payload.ref, 256) },
      };
  } else if (
    event === 'workflow_job' ||
    event === 'check_suite' ||
    event === 'pull_request'
  ) {
    const item = fields(payload[event]);
    const itemId = id(event === 'pull_request' ? item.number : item.id);
    const sha = text(
      event === 'pull_request' ? fields(item.head).sha : item.head_sha,
      40
    );
    const updated = Date.parse(
      text(
        item.updated_at ??
          item.completed_at ??
          item.started_at ??
          item.created_at
      ) ?? ''
    );
    if (itemId && sha && validSha(sha) && Number.isFinite(updated))
      projection = {
        key: `${event}:${itemId}`,
        kind: event,
        sha,
        updated,
        data: {
          id: itemId,
          run_id: id(item.run_id),
          name: text(item.name),
          status: text(item.status ?? item.state),
          conclusion: text(item.conclusion) ?? null,
          draft: item.draft === true,
          merged: item.merged === true,
          base: text(fields(item.base).ref),
        },
      };
  }
  return projection && { repo, projection };
}
