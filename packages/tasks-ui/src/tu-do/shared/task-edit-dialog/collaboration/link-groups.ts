import type { TaskLink, TaskLinkKind, TaskLinkState } from './types';

export const LINK_KIND_ORDER: readonly TaskLinkKind[] = [
  'pull_request',
  'commit',
  'ci_run',
  'issue',
  'doc',
  'url',
];

export interface TaskLinkGroup {
  kind: TaskLinkKind;
  links: TaskLink[];
}

/** Groups links by kind in display order, dropping empty groups. */
export function groupTaskLinks(links: readonly TaskLink[]): TaskLinkGroup[] {
  return LINK_KIND_ORDER.map((kind) => ({
    kind,
    links: links.filter((link) => link.kind === kind),
  })).filter((group) => group.links.length > 0);
}

/** Semantic state colors; every state also carries a text label. */
export const LINK_STATE_CLASS: Record<TaskLinkState, string> = {
  open: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  merged: 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
  closed: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  draft: 'border-border bg-muted text-muted-foreground',
  success: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  failure: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  pending: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
  cancelled: 'border-border bg-muted text-muted-foreground',
};

export function isHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
