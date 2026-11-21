import type {
  DeployEnvironmentName,
  DeployLane,
  DeployProjectResponse,
  DeployProjectsResponse,
  DeployRecord,
  DeployStatus,
} from '@tuturuuu/internal-api/infrastructure';

// One state per mutually exclusive view of a query. A refetch that keeps the
// last data is `ready` with `refreshing`, never a second loading state.
export type ProjectsView =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unconfigured' }
  | { kind: 'empty' }
  | {
      kind: 'ready';
      projects: Extract<
        DeployProjectsResponse,
        { configured: true }
      >['projects'];
    };

export type ProjectView =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unconfigured' }
  | {
      kind: 'ready';
      data: Extract<DeployProjectResponse, { configured: true }>;
      refreshing: boolean;
    };

type QueryLike<T> = {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function projectsView(
  query: QueryLike<DeployProjectsResponse>
): ProjectsView {
  if (query.data) {
    if (!query.data.configured) return { kind: 'unconfigured' };
    if (query.data.projects.length === 0) return { kind: 'empty' };
    return { kind: 'ready', projects: query.data.projects };
  }
  if (query.isPending && !query.error) return { kind: 'loading' };
  return { kind: 'error', message: messageOf(query.error) };
}

export function projectView(
  query: QueryLike<DeployProjectResponse>
): ProjectView {
  if (query.data) {
    if (!query.data.configured) return { kind: 'unconfigured' };
    return { kind: 'ready', data: query.data, refreshing: query.isFetching };
  }
  if (query.isPending && !query.error) return { kind: 'loading' };
  return { kind: 'error', message: messageOf(query.error) };
}

// Actions an operator can take on one deployment row. Mirrors the
// coordinator's own rules so the dashboard never offers a refused action.
// The DeployAction variants that target one deployment.
export type RecordAction = 'promote' | 'rollback' | 'cancel' | 'resolve';

// What a succeeded deployment serves: a rollback serves its source.
const serves = (record: DeployRecord) =>
  record.kind === 'rollback'
    ? (record.sourceDeploymentId ?? record.id)
    : record.id;

export function recordActions(
  environment: DeployEnvironmentName,
  lane: DeployLane,
  record: DeployRecord,
  canOperate: boolean
): RecordAction[] {
  if (!canOperate) return [];
  const actions: RecordAction[] = [];
  if (record.status === 'succeeded' && environment === 'staging')
    actions.push('promote');
  if (
    record.status === 'succeeded' &&
    environment !== 'preview' &&
    (!lane.current || serves(lane.current) !== serves(record))
  )
    actions.push('rollback');
  // Resolving a marker needs the lane lock to be free.
  if (
    record.status === 'queued' &&
    record.kind !== 'deploy' &&
    !lane.lockDeploymentId
  )
    actions.push('resolve');
  if (record.status === 'queued') actions.push('cancel');
  return actions;
}

// Recent deployments, plus the current one when it is older than the
// snapshot's recent window, so the served version is always listed.
export function laneRecords(lane: DeployLane): DeployRecord[] {
  const current = lane.current;
  if (!current || lane.deployments.some((record) => record.id === current.id))
    return lane.deployments;
  return [...lane.deployments, current];
}

export type StatusTone = 'success' | 'danger' | 'warning' | 'active' | 'muted';

export function statusTone(status: DeployStatus): StatusTone {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'danger';
    case 'unknown':
      return 'warning';
    case 'publishing':
    case 'queued':
      return 'active';
    case 'superseded':
    case 'cancelled':
      return 'muted';
    default:
      return 'muted';
  }
}

export const shortSha = (sha: string) => sha.slice(0, 7);

// GitHub actors arrive as `github:<login>`; operators as their user id.
export const actorLabel = (actor: string | null) =>
  actor?.startsWith('github:') ? actor.slice('github:'.length) : actor;
