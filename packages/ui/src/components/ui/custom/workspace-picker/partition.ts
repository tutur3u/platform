import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

type Workspace = InternalApiWorkspaceSummary;

/** The actor's own personal workspace; guest access to one never counts. */
export function isPersonalWorkspace(workspace: Workspace) {
  return Boolean(workspace.personal) && workspace.access_type !== 'guest';
}

/** The platform root workspace, listed as Internal. */
export function isInternalWorkspace(workspace: Workspace) {
  return workspace.id === ROOT_WORKSPACE_ID && !isPersonalWorkspace(workspace);
}

/**
 * Personal and Internal keep a fixed place at the top of the picker, so they
 * are never repeated in Pinned or Recent and cannot be pinned.
 */
export function isFixedWorkspace(workspace: Workspace) {
  return isPersonalWorkspace(workspace) || isInternalWorkspace(workspace);
}

export function matchesWorkspaceQuery(workspace: Workspace, query: string) {
  if (!query) return true;
  return [workspace.name, workspace.id, workspace.tier].some((value) =>
    value?.toLocaleLowerCase().includes(query)
  );
}

function byName(a: Workspace, b: Workspace) {
  return (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id);
}

function pick(ids: readonly string[], source: Map<string, Workspace>) {
  const seen = new Set<string>();
  return ids.flatMap((id) => {
    const workspace = source.get(id);
    if (!workspace || seen.has(id)) return [];
    seen.add(id);
    return [workspace];
  });
}

export interface WorkspacePickerPartition {
  personal: Workspace[];
  internal: Workspace[];
  pinned: Workspace[];
  recent: Workspace[];
  rest: Workspace[];
  hidden: Workspace[];
}

export const PICKER_SECTION_ORDER = [
  'personal',
  'internal',
  'pinned',
  'recent',
  'rest',
] as const satisfies readonly (keyof WorkspacePickerPartition)[];

/**
 * Splits workspaces into the picker's sections. Every workspace lands in at
 * most one section. Hidden workspaces only appear in `hidden`, whatever their
 * pin, recent or fixed status. `query` must already be trimmed and lowercased.
 */
export function partitionWorkspaces({
  workspaces,
  hiddenIds,
  pinnedIds,
  recentIds,
  query,
}: {
  workspaces: readonly Workspace[];
  hiddenIds: readonly string[];
  pinnedIds: readonly string[];
  recentIds: readonly string[];
  query: string;
}): WorkspacePickerPartition {
  const unique = [
    ...new Map(
      workspaces.map((workspace) => [workspace.id, workspace])
    ).values(),
  ].filter((workspace) => matchesWorkspaceQuery(workspace, query));
  const hiddenSet = new Set(hiddenIds);
  const visible = unique.filter((workspace) => !hiddenSet.has(workspace.id));
  const flexible = new Map(
    visible
      .filter((workspace) => !isFixedWorkspace(workspace))
      .map((workspace) => [workspace.id, workspace])
  );
  const pinned = pick(pinnedIds, flexible);
  const pinnedSet = new Set(pinned.map((workspace) => workspace.id));
  const recent = pick(
    recentIds.filter((id) => !pinnedSet.has(id)),
    flexible
  );
  const placed = new Set([...pinnedSet, ...recent.map((w) => w.id)]);
  return {
    personal: visible.filter(isPersonalWorkspace),
    internal: visible.filter(isInternalWorkspace),
    pinned,
    recent,
    rest: [...flexible.values()]
      .filter((workspace) => !placed.has(workspace.id))
      .sort(byName),
    hidden: unique
      .filter((workspace) => hiddenSet.has(workspace.id))
      .sort(byName),
  };
}

/** Rows in visual and keyboard order. */
export function orderedPickerRows(
  partition: WorkspacePickerPartition,
  hiddenOpen: boolean
) {
  return [
    ...PICKER_SECTION_ORDER.flatMap((key) => partition[key]),
    ...(hiddenOpen ? partition.hidden : []),
  ];
}
