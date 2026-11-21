/**
 * Fleet card parser. Pure and framework-free. First-class task fields are the
 * source of truth (list status, labels, projects, assignees, priority, end
 * date, relationships and, once added, updated_at, needs_user and external
 * links). The legacy fleet:v1 description header only fills values a
 * first-class field leaves empty. Missing values stay null so the UI can say so.
 */
import {
  clean,
  readLegacyFleetHeader,
  toSafeHref,
} from './fleet-legacy-header';

export { descriptionToText, toSafeHref } from './fleet-legacy-header';

export const FLEET_STATUSES = [
  'needs_user',
  'running',
  'waiting_review',
  'waiting_ci',
  'blocked',
  'queued',
  'done',
] as const;
export type FleetStatus = (typeof FLEET_STATUSES)[number] | 'unknown';
export type FleetPriority = 'critical' | 'high' | 'normal' | 'low';
export type FleetStaleness = 'fresh' | 'aging' | 'stale' | 'unknown';
export type FleetEtaState = 'on_track' | 'due_soon' | 'overdue' | 'none';
export type FleetLinkType =
  | 'pr'
  | 'commit'
  | 'thread'
  | 'issue'
  | 'doc'
  | 'run';

export interface FleetLink {
  type: FleetLinkType | 'link';
  value: string;
  href: string | null;
}

export interface FleetTaskMeta {
  /** The task's external key (e.g. N-163) when the fleet sync set one. */
  code: string | null;
  isFleetTask: boolean;
  /** True when any value still came from the legacy description header. */
  usesLegacyHeader: boolean;
  hasBlock: boolean;
  status: FleetStatus;
  owner: string | null;
  /** Where the owner came from: an agent identity, a contact or a human assignee. */
  ownerKind: 'agent' | 'person' | null;
  product: string | null;
  priority: FleetPriority | null;
  eta: string | null;
  lastUpdate: string | null;
  needsUser: boolean;
  needsUserReason: string | null;
  blocked: boolean;
  blockedBy: string | null;
  /** Blocked-by task relationships, whether or not the blocker is finished. */
  blockedByCount: number;
  links: FleetLink[];
}

/** The first-class fields the Fleet view reads; every one is optional. */
export interface FleetTaskInput {
  description?: string | null;
  labels?: { name: string }[] | null;
  priority?: string | null;
  end_date?: string | null;
  projects?: { name: string }[] | null;
  assignees?:
    | {
        display_name?: string | null;
        email?: string | null;
        handle?: string | null;
      }[]
    | null;
  relationship_summary?: { blocked_by_count?: number | null } | null;
  /** Fields the fleet task-fields work (N-176) adds; read when present. */
  fleet_status?: string | null;
  status?: string | null;
  external_key?: string | null;
  /** Agent and contact identities, primary first (position, then id). */
  virtual_assignees?: FleetIdentityInput[] | null;
  /** Compatibility projection of virtual agent assignees. */
  agent_assignees?: FleetIdentityInput[] | null;
  updated_at?: string | null;
  /** Read-only provenance of the legacy header's last_update after cutover. */
  legacy_last_update?: string | null;
  needs_user?: boolean | null;
  needs_user_reason?: string | null;
  blocked_reason?: string | null;
  /** Task resources; only an http(s) `url` becomes a link. */
  task_resources?: FleetResourceInput[] | null;
  /** Compatibility projection of link-like resources. */
  external_links?: FleetResourceInput[] | null;
}

export interface FleetIdentityInput {
  key?: string | null;
  kind?: string | null;
  display_name?: string | null;
  position?: number | null;
}

export interface FleetResourceInput {
  kind?: string | null;
  url?: string | null;
  title?: string | null;
  label?: string | null;
}

export interface FleetParseContext {
  /** The task list's board status: not_started, active, review, done, closed, documents. */
  listStatus?: string | null;
}

export const FLEET_TITLE_MAX = 72;
const HOUR = 60 * 60 * 1000;
const PRIORITIES = new Set<string>(['critical', 'high', 'normal', 'low']);
/** task_resources kinds onto card link icons; unknown kinds read as plain links. */
const RESOURCE_KIND: Record<string, FleetLinkType | 'link'> = {
  pr: 'pr',
  commit: 'commit',
  ci_run: 'run',
  run: 'run',
  t3_thread: 'thread',
  thread: 'thread',
  issue: 'issue',
  doc: 'doc',
  document: 'doc',
  markdown: 'doc',
  url: 'link',
};
const LIST_STATUS: Record<string, FleetStatus> = {
  not_started: 'queued',
  active: 'running',
  review: 'waiting_review',
  done: 'done',
  closed: 'done',
};

function normalizeStatus(raw: string | null | undefined): FleetStatus | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/-/g, '_');
  return (FLEET_STATUSES as readonly string[]).includes(v)
    ? (v as FleetStatus)
    : null;
}

function first<T>(...values: (T | null | undefined)[]): T | null {
  for (const v of values)
    if (v !== null && v !== undefined && v !== '') return v;
  return null;
}

export function parseFleetTaskMeta(
  task: FleetTaskInput,
  context: FleetParseContext = {}
): FleetTaskMeta {
  const header = readLegacyFleetHeader(task.description);
  const h = header.fields;
  const labels = (task.labels ?? []).map((l) => l.name.trim().toLowerCase());
  const label = (prefix: string) => {
    const hit = labels.find((l) => l.startsWith(prefix));
    return hit ? clean(hit.slice(prefix.length)) : null;
  };
  const hasLabelSignal = labels.some(
    (l) =>
      l === 'needs-user' ||
      l.startsWith('state:') ||
      l.startsWith('owner:') ||
      l.startsWith('product:')
  );
  let legacy = false;
  const fromHeader = <T>(value: T | null): T | null => {
    if (value !== null) legacy = true;
    return value;
  };

  const status =
    first(
      normalizeStatus(task.fleet_status ?? task.status),
      normalizeStatus(label('state:'))
    ) ??
    first(context.listStatus ? LIST_STATUS[context.listStatus] : null) ??
    fromHeader(first(normalizeStatus(h.status), normalizeStatus(h.state))) ??
    'unknown';

  const assignee = task.assignees?.find(
    (a) =>
      clean(a.display_name ?? undefined) ||
      clean(a.email ?? undefined) ||
      clean(a.handle ?? undefined)
  );
  const identities = [
    ...[...(task.virtual_assignees ?? [])].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0)
    ),
    ...(task.agent_assignees ?? []),
  ];
  const agent = identities.find(
    (a) => clean(a.display_name ?? undefined) || clean(a.key ?? undefined)
  );
  const ownerLabel = label('owner:');
  const agentName = agent
    ? (clean(agent.display_name ?? undefined) ?? clean(agent.key ?? undefined))
    : null;
  const assigneeName = assignee
    ? (clean(assignee.display_name ?? undefined) ??
      clean(assignee.email ?? undefined) ??
      clean(assignee.handle ?? undefined))
    : null;
  const ownerKind: FleetTaskMeta['ownerKind'] = ownerLabel
    ? null
    : agentName
      ? agent?.kind?.toLowerCase() === 'contact'
        ? 'person'
        : 'agent'
      : assigneeName
        ? 'person'
        : null;
  const owner =
    first(ownerLabel, agentName, assigneeName) ?? fromHeader(clean(h.owner));
  const product =
    first(clean(task.projects?.[0]?.name), label('product:')) ??
    fromHeader(clean(h.product));

  const nativePriority = (task.priority ?? '').toLowerCase();
  const headerPriority = (h.priority ?? '').trim().toLowerCase();
  const priority = PRIORITIES.has(nativePriority)
    ? (nativePriority as FleetPriority)
    : PRIORITIES.has(headerPriority)
      ? fromHeader(headerPriority as FleetPriority)
      : null;

  const eta = clean(task.end_date ?? undefined) ?? fromHeader(clean(h.eta));
  const lastUpdate =
    clean(task.updated_at ?? undefined) ??
    clean(task.legacy_last_update ?? undefined) ??
    fromHeader(clean(h.last_update));

  const headerNeeds = clean(h.needs_user)?.toLowerCase() ?? null;
  let needsUser = false;
  if (typeof task.needs_user === 'boolean') needsUser = task.needs_user;
  else if (labels.includes('needs-user') || status === 'needs_user')
    needsUser = true;
  else if (headerNeeds !== null)
    needsUser = fromHeader(headerNeeds === 'true') === true;
  else if (
    normalizeStatus(h.status) === 'needs_user' ||
    normalizeStatus(h.state) === 'needs_user'
  )
    needsUser = fromHeader(true) === true;
  const needsUserReason = needsUser
    ? (clean(task.needs_user_reason ?? undefined) ??
      fromHeader(clean(h.needs_user_reason)))
    : null;

  const blockedBy =
    clean(task.blocked_reason ?? undefined) ?? fromHeader(clean(h.blocked_by));
  const blockedByCount = Math.max(
    0,
    task.relationship_summary?.blocked_by_count ?? 0
  );
  const blocked =
    status !== 'done' &&
    (status === 'blocked' || blockedByCount > 0 || blockedBy !== null);

  const resources = task.task_resources?.length
    ? task.task_resources
    : (task.external_links ?? []);
  const nativeLinks: FleetLink[] = resources
    .filter((l) => typeof l?.url === 'string' && l.url.trim())
    .map((l) => {
      const url = (l.url ?? '').trim();
      const kind = RESOURCE_KIND[(l.kind ?? '').toLowerCase()] ?? 'link';
      return {
        type: kind,
        value:
          clean(l.title ?? undefined) ?? clean(l.label ?? undefined) ?? url,
        href: toSafeHref(url),
      };
    });
  const links = nativeLinks.length
    ? nativeLinks
    : header.links.length
      ? (fromHeader(header.links) ?? [])
      : [];

  return {
    code: clean(task.external_key ?? undefined),
    isFleetTask:
      header.present ||
      hasLabelSignal ||
      typeof task.needs_user === 'boolean' ||
      nativeLinks.length > 0 ||
      Boolean(clean(task.external_key ?? undefined)) ||
      Boolean(agent),
    usesLegacyHeader: legacy,
    hasBlock: header.present,
    status,
    owner,
    ownerKind,
    product,
    priority,
    eta,
    lastUpdate,
    needsUser,
    needsUserReason,
    blocked,
    blockedBy,
    blockedByCount,
    links,
  };
}

function toTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** fresh < 2h, aging 2-24h, stale >= 24h; unknown when nothing was reported. */
export function getFleetStaleness(
  lastUpdate: string | null,
  now: number = Date.now()
): FleetStaleness {
  const t = toTime(lastUpdate);
  if (t === null) return 'unknown';
  const age = now - t;
  if (age < 2 * HOUR) return 'fresh';
  if (age < 24 * HOUR) return 'aging';
  return 'stale';
}

export function getFleetEtaState(
  eta: string | null,
  status: FleetStatus,
  now: number = Date.now()
): FleetEtaState {
  const t = toTime(eta);
  if (t === null) return 'none';
  if (status === 'done') return 'on_track';
  if (t < now) return 'overdue';
  if (t - now <= 2 * HOUR) return 'due_soon';
  return 'on_track';
}

export function isFleetTitleTooLong(title: string): boolean {
  return title.trim().length > FLEET_TITLE_MAX;
}

const KEY_PREFIX =
  /^\s*(?:\[([A-Za-z][A-Za-z0-9]*-\d+)\]\s*[:\-\u2013\u2014|]*|([A-Za-z][A-Za-z0-9]*-\d+)(?![-\d])\s*[:\-\u2013\u2014|]+)\s*/;

/**
 * The card title without a leading copy of the card code ("N-165: ...",
 * "[N-165] ..."), since the code already sits in the scan row. Only the
 * matching code is removed, and a title that would become empty is kept.
 */
export function getFleetDisplayTitle(
  name: string,
  code: string | null
): string {
  const title = name.trim();
  if (!code) return title;
  const match = title.match(KEY_PREFIX);
  const key = match?.[1] ?? match?.[2];
  if (!match || !key || key.toLowerCase() !== code.trim().toLowerCase())
    return title;
  const rest = title.slice(match[0].length).trim();
  return rest || title;
}
