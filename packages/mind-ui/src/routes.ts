type MindRouteInput = {
  mindPrefix?: string;
  workspaceSlug: string;
};

type MindBoardRouteInput = MindRouteInput & {
  boardId: string;
};

function normalizeMindPrefix(prefix?: string) {
  if (!prefix) return '';
  const trimmed = prefix.trim();
  if (!trimmed || trimmed === '/') return '';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/u, '');
}

export function buildMindWorkspaceHref({
  mindPrefix,
  workspaceSlug,
}: MindRouteInput) {
  return `/${workspaceSlug}${normalizeMindPrefix(mindPrefix)}`;
}

export function buildMindBoardHref({
  boardId,
  mindPrefix,
  workspaceSlug,
}: MindBoardRouteInput) {
  return `${buildMindWorkspaceHref({
    mindPrefix,
    workspaceSlug,
  })}/boards/${boardId}`;
}

export function getSelectedMindBoardId(pathname: string) {
  const match = pathname.match(/\/boards\/([^/]+)/u);
  return match?.[1] ?? null;
}
