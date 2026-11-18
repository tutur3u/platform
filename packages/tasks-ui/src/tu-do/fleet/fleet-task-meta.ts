/**
 * fleet:v1 card-schema parser. Pure and framework-free: it reads a task's
 * description (markdown or a TipTap JSON document), its labels, priority and
 * end date, and returns the structured fields the Fleet view renders.
 * Missing values stay null so the UI can say so instead of guessing.
 */

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
  isFleetTask: boolean;
  hasBlock: boolean;
  status: FleetStatus;
  owner: string | null;
  product: string | null;
  priority: FleetPriority | null;
  eta: string | null;
  lastUpdate: string | null;
  needsUser: boolean;
  needsUserReason: string | null;
  blockedBy: string | null;
  links: FleetLink[];
}

export interface FleetTaskInput {
  description?: string | null;
  labels?: { name: string }[] | null;
  priority?: string | null;
  end_date?: string | null;
}

export const FLEET_TITLE_MAX = 72;
const HOUR = 60 * 60 * 1000;
const LINK_TYPES = new Set<string>([
  'pr',
  'commit',
  'thread',
  'issue',
  'doc',
  'run',
]);
const PRIORITIES = new Set<string>(['critical', 'high', 'normal', 'low']);

/** Flattens a TipTap/ProseMirror JSON document to text; returns markdown as is. */
export function descriptionToText(description?: string | null): string {
  if (!description) return '';
  const trimmed = description.trim();
  if (!trimmed.startsWith('{')) return description;
  try {
    const doc = JSON.parse(trimmed) as unknown;
    const lines: string[] = [];
    const walk = (node: unknown, line: string[]): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as { type?: string; text?: string; content?: unknown[] };
      if (typeof n.text === 'string') line.push(n.text);
      if (n.type === 'hardBreak') line.push('\n');
      const isBlock =
        n.type === 'paragraph' ||
        n.type === 'heading' ||
        n.type === 'listItem' ||
        n.type === 'codeBlock';
      if (isBlock) {
        const inner: string[] = [];
        for (const child of n.content ?? []) walk(child, inner);
        lines.push(...inner.join('').split('\n'));
        return;
      }
      for (const child of n.content ?? []) walk(child, line);
    };
    const top: string[] = [];
    walk(doc, top);
    if (top.length) lines.push(top.join(''));
    return lines.join('\n');
  } catch {
    return description;
  }
}

function extractBlock(text: string): string[] | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) =>
    /^\s*(<!--\s*)?fleet:v1\s*(-->)?\s*$/.test(l)
  );
  if (start < 0) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*(<!--\s*)?\/fleet:v1\s*(-->)?\s*$/.test(line)) break;
    if (/^\s*##\s/.test(line)) break;
    body.push(line);
  }
  return body;
}

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * Only an http(s) URL written in the data becomes a link; nothing is built
 * from ids, and every other scheme stays plain text.
 */
export function toSafeHref(value: string): string | null {
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function parseLink(raw: string): FleetLink | null {
  const text = raw.replace(/^\s*-\s*/, '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    return { type: 'link', value: text, href: toSafeHref(text) };
  }
  const m = text.match(/^([a-z]+)\s*:\s*(.+)$/i);
  if (!m) return null;
  const key = m[1]!.toLowerCase();
  const value = m[2]!.trim();
  const type = LINK_TYPES.has(key) ? (key as FleetLinkType) : 'link';
  return { type, value, href: toSafeHref(value) };
}

function normalizeStatus(raw: string | null): FleetStatus | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/-/g, '_');
  return (FLEET_STATUSES as readonly string[]).includes(v)
    ? (v as FleetStatus)
    : null;
}

export function parseFleetTaskMeta(task: FleetTaskInput): FleetTaskMeta {
  const fields: Record<string, string> = {};
  const links: FleetLink[] = [];
  const block = extractBlock(descriptionToText(task.description));
  if (block) {
    let inLinks = false;
    for (const line of block) {
      const kv = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
      if (kv && !/^\s*-/.test(line)) {
        const key = kv[1]!.toLowerCase();
        inLinks = key === 'links';
        if (inLinks) {
          const inline = parseLink(kv[2] ?? '');
          if (inline) links.push(inline);
        } else fields[key] = kv[2] ?? '';
      } else if (inLinks && /^\s*-/.test(line)) {
        const link = parseLink(line);
        if (link) links.push(link);
      }
    }
  }

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

  const status =
    normalizeStatus(clean(fields.status) ?? clean(fields.state)) ??
    normalizeStatus(label('state:')) ??
    'unknown';
  const needsFlag = clean(fields.needs_user)?.toLowerCase();
  const needsUser = needsFlag
    ? needsFlag === 'true'
    : labels.includes('needs-user') || status === 'needs_user';
  const rawPriority = (
    clean(fields.priority) ??
    task.priority ??
    ''
  ).toLowerCase();

  return {
    isFleetTask: Boolean(block) || hasLabelSignal,
    hasBlock: Boolean(block),
    status,
    owner: clean(fields.owner) ?? label('owner:'),
    product: clean(fields.product) ?? label('product:'),
    priority: PRIORITIES.has(rawPriority)
      ? (rawPriority as FleetPriority)
      : null,
    eta: clean(fields.eta) ?? clean(task.end_date ?? undefined),
    lastUpdate: clean(fields.last_update),
    needsUser,
    needsUserReason: needsUser ? clean(fields.needs_user_reason) : null,
    blockedBy: clean(fields.blocked_by),
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
