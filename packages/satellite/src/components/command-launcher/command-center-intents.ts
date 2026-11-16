import {
  getLaunchableApp,
  type LaunchableWorkspace,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';

/**
 * Typed-query handoffs from the command center. Each opens an existing
 * composer with the query as an editable draft; neither submits, sends or
 * spends anything.
 *
 * - Tasks: `/{workspace}/tasks/new?title=` seeds the task name field of the
 *   Tasks composer (consumer: apps/tasks task-plan-title-intent.ts).
 * - Mira: `/{workspace}?prompt=` on the platform app adds to the Mira draft
 *   once, preserving any existing text.
 */
export const TASK_TITLE_INTENT_MAX_LENGTH = 500;
export const MIRA_PROMPT_INTENT_MAX_LENGTH = 4000;
const SOURCE = 'command-launcher';

/** Match the receivers' UTF-16 length limits without splitting a pair. */
export function boundIntentText(text: string, max: number) {
  let result = '';
  for (const character of text.trim()) {
    if (result.length + character.length > max) break;
    result += character;
  }
  return result.trim();
}

export function buildCreateTaskIntentUrl({
  currentOrigin,
  query,
  workspace,
}: {
  currentOrigin?: string;
  query: string;
  workspace: LaunchableWorkspace | null;
}) {
  const app = getLaunchableApp('tasks');
  if (!app) return null;
  const tasksPath =
    workspace && app.workspacePathResolver
      ? app.workspacePathResolver(workspace)
      : app.defaultPath;
  return resolveLaunchableAppUrl({
    app,
    currentOrigin,
    path: `${tasksPath.replace(/\/+$/u, '')}/new`,
    searchParams: {
      source: SOURCE,
      title: boundIntentText(query, TASK_TITLE_INTENT_MAX_LENGTH),
    },
  });
}

export function buildAskMiraIntentUrl({
  currentOrigin,
  query,
  workspace,
}: {
  currentOrigin?: string;
  query: string;
  workspace: LaunchableWorkspace | null;
}) {
  const app = getLaunchableApp('platform');
  if (!app) return null;
  return resolveLaunchableAppUrl({
    app,
    currentOrigin,
    // Without a resolved workspace, the personal workspace hosts Mira.
    path: workspace ? undefined : '/personal',
    searchParams: {
      prompt: boundIntentText(query, MIRA_PROMPT_INTENT_MAX_LENGTH),
      source: SOURCE,
    },
    workspace,
  });
}
