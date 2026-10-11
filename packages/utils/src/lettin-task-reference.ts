import {
  getPortlessInternalAppUrl,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from './internal-domains';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type LettinTaskReference = {
  workspaceId: string;
  worldId: string;
  entryId?: string;
  locale: string;
};
function valid(reference: LettinTaskReference) {
  return (
    (['personal', 'internal'].includes(reference.workspaceId) ||
      uuid.test(reference.workspaceId)) &&
    uuid.test(reference.worldId) &&
    (reference.entryId === undefined || uuid.test(reference.entryId)) &&
    ['en', 'vi'].includes(reference.locale)
  );
}
function origin(app: 'lettin' | 'tasks') {
  const production = PRODUCTION_INTERNAL_APP_DOMAINS.find(
    (domain) => domain.name === app
  )!.url;
  return process.env.NODE_ENV === 'development'
    ? (getPortlessInternalAppUrl(app) ?? production)
    : production;
}
/** The handoff intentionally carries IDs only, never notebook text or identity fields. */
export function getLettinTaskPlanUrl(reference: LettinTaskReference) {
  if (!valid(reference)) return null;
  const url = new URL(
    `/${reference.locale}/${reference.workspaceId}/tasks/new`,
    origin('tasks')
  );
  url.searchParams.set('lettinWorld', reference.worldId);
  if (reference.entryId) url.searchParams.set('lettinEntry', reference.entryId);
  return url.toString();
}
/** A private reference grants no notebook access; readers still authenticate in Lettin. */
export function getLettinNotebookReferenceUrl(reference: LettinTaskReference) {
  if (!valid(reference)) return null;
  const url = new URL(
    `/${reference.locale}/${reference.workspaceId}/wiki/${reference.worldId}/overview`,
    origin('lettin')
  );
  url.searchParams.set('entry', reference.entryId ?? reference.worldId);
  return url.toString();
}
