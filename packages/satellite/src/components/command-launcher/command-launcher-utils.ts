import {
  LAUNCHABLE_APPS,
  type LaunchableApp,
  type LaunchableAppSlug,
} from '@tuturuuu/utils/launchable-apps';
import type {
  GlobalCommandLauncherLabels,
  LauncherWorkspace,
} from './command-launcher-types';

export type CommandLauncherHostApp = LaunchableAppSlug | 'external';

export type WorkspaceSearchItem = LauncherWorkspace & {
  aliases: string[];
  keywords: string[];
  title: string;
};

export const APP_SEARCH_ITEMS: readonly LaunchableApp[] = LAUNCHABLE_APPS.map(
  (app) => ({
    ...app,
    keywords: [app.category, app.slug, app.packageName],
    subtitle: app.productionUrl,
  })
);

export const REMOTE_WORKSPACE_SEARCH_LIMIT = 50;
export const VISIBLE_WORKSPACE_SEARCH_LIMIT = 20;

export function workspaceToSearchItem(
  workspace: LauncherWorkspace
): WorkspaceSearchItem {
  const accessType = 'access_type' in workspace ? workspace.access_type : null;
  return {
    ...workspace,
    aliases: [
      workspace.id,
      workspace.personal ? 'personal' : '',
      accessType === 'guest' ? 'guest' : '',
      workspace.guest_landing_path ?? '',
    ].filter(Boolean),
    keywords: [
      workspace.personal ? 'personal' : '',
      accessType === 'guest' ? 'guest' : '',
      workspace.created_by_me ? 'created by me' : '',
    ].filter(Boolean),
    title: workspace.name || workspace.id,
  };
}

export function isWorkspaceCurrent(
  workspace: LauncherWorkspace,
  currentWorkspaceId?: string | null,
  pathname?: string | null
) {
  if (workspace.id === currentWorkspaceId) return true;
  if (!pathname) return false;
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  return (
    firstSegment === workspace.id ||
    (firstSegment === 'personal' && workspace.personal)
  );
}

export function mergeWorkspaces(
  localWorkspaces: readonly LauncherWorkspace[],
  remoteWorkspaces: readonly LauncherWorkspace[]
) {
  const byId = new Map<string, LauncherWorkspace>();
  for (const workspace of localWorkspaces) byId.set(workspace.id, workspace);
  for (const workspace of remoteWorkspaces) byId.set(workspace.id, workspace);
  return [...byId.values()];
}

export function getMatchContext<T extends { title: string }>(
  result: { item: T; matchedText: string; reason: string },
  labels: GlobalCommandLauncherLabels
) {
  if (result.reason === 'exact' || result.reason === 'prefix') return null;
  if (result.matchedText === result.item.title) return result.reason;
  return `${labels.match}: ${result.matchedText}`;
}

/** Stable cmdk values shared by result rows and their keyboard entries. */
export const commandItemValue = {
  app: (app: Pick<LaunchableApp, 'slug' | 'title'>) =>
    `app-${app.slug}-${app.title}`,
  navigation: (item: { href: string; title: string }) =>
    `nav-${item.href}-${item.title}`,
  workspace: (workspace: { id: string; name?: string | null }) =>
    `workspace-${workspace.id}-${workspace.name}`,
};
