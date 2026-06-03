import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag, getTaskStateFilters } from './args';
import { type CliConfig, writeCliConfig } from './config';
import { color, escapeTerminalText, selectItem } from './select';

type ListedWorkspace = Awaited<
  ReturnType<TuturuuuUserClient['workspaces']['list']>
>[number];
export type ListedBoard = Awaited<
  ReturnType<TuturuuuUserClient['tasks']['listBoards']>
>['boards'][number];
export type ListedList = Awaited<
  ReturnType<TuturuuuUserClient['tasks']['listLists']>
>['lists'][number];
export type ListedLabel = Awaited<
  ReturnType<TuturuuuUserClient['tasks']['listLabels']>
>[number];
export type ListedProject = Awaited<
  ReturnType<TuturuuuUserClient['tasks']['listProjects']>
>[number];

export function resolveWorkspaceName(
  workspaceId: string,
  workspaces: Awaited<ReturnType<TuturuuuUserClient['workspaces']['list']>>
) {
  const workspace = workspaces.find(
    (entry) =>
      entry.id === workspaceId ||
      (workspaceId === 'personal' && entry.personal === true)
  );

  return workspace?.name || workspaceId;
}

export function getWorkspaceConfigId(workspace: ListedWorkspace) {
  return workspace.personal ? 'personal' : workspace.id;
}

function findDefaultIndex<T>(
  items: T[],
  predicate: (item: T) => boolean,
  fallback = 0
) {
  const index = items.findIndex(predicate);
  return index >= 0 ? index : fallback;
}

function ensureSelectable(json: boolean) {
  if (json) {
    throw new Error('Interactive selection is not available with --json.');
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isPrefixedTaskIdentifier(value: string) {
  return /^[a-z][a-z0-9_-]*-\d+$/i.test(value.trim());
}

function formatColorBadge(value?: string | null) {
  const rawLabel = value?.trim();
  if (!rawLabel) return undefined;

  const label = escapeTerminalText(rawLabel);
  if (!label) return undefined;

  return `${color.hexOrName('■', rawLabel)} ${color.hexOrName(label.toUpperCase(), rawLabel)}`;
}

async function resolveTaskIdentifier(
  client: TuturuuuUserClient,
  workspaceId: string,
  config: CliConfig,
  flags: Record<string, FlagValue>,
  identifier: string
) {
  if (isUuid(identifier)) {
    return identifier;
  }

  const explicitBoardId = getFlag(flags, 'board') || getFlag(flags, 'board-id');
  const explicitListId = getFlag(flags, 'list') || getFlag(flags, 'list-id');
  const scopedByPrefix = isPrefixedTaskIdentifier(identifier);

  const { tasks } = await client.tasks.list(workspaceId, {
    boardId:
      explicitBoardId || (scopedByPrefix ? undefined : config.currentBoardId),
    completed: flags.done === true ? 'only' : undefined,
    closed: flags.closed === true ? 'only' : undefined,
    identifier,
    includeDeleted: flags.deleted === true,
    limit: 2,
    listId: explicitListId,
  });

  if (tasks.length === 1 && tasks[0]?.id) {
    return tasks[0].id;
  }

  if (tasks.length > 1) {
    throw new Error(
      `Task identifier ${identifier} matched multiple tasks. Use a task UUID.`
    );
  }

  throw new Error(`Task identifier ${identifier} was not found.`);
}

function formatBadge(value?: string | null) {
  const rawLabel = String(value || 'free').trim() || 'free';
  const normalizedLabel = rawLabel.toUpperCase();
  const label = escapeTerminalText(rawLabel).toUpperCase();
  const badge = `[${label}]`;

  if (['DONE', 'CLOSED', 'ARCHIVED'].includes(normalizedLabel)) {
    return color.dim(badge);
  }

  if (['PRO', 'PLUS', 'PREMIUM'].includes(normalizedLabel)) {
    return color.magenta(badge);
  }

  if (['BUSINESS', 'TEAM'].includes(normalizedLabel)) {
    return color.yellow(badge);
  }

  if (['ENTERPRISE', 'STUDIO'].includes(normalizedLabel)) {
    return color.cyan(badge);
  }

  if (['ERROR', 'BLOCKED', 'BLOCKING'].includes(normalizedLabel)) {
    return color.red(badge);
  }

  return color.green(badge);
}

export async function chooseWorkspace(
  client: TuturuuuUserClient,
  config: CliConfig,
  json: boolean
) {
  ensureSelectable(json);
  const workspaces = await client.workspaces.list();
  const currentWorkspaceId = config.currentWorkspaceId || 'personal';

  return selectItem({
    defaultIndex: findDefaultIndex(
      workspaces,
      (workspace) =>
        workspace.id === currentWorkspaceId ||
        (currentWorkspaceId === 'personal' && workspace.personal === true),
      findDefaultIndex(workspaces, (workspace) => workspace.personal === true)
    ),
    getBadge: (workspace) => formatBadge(workspace.tier),
    getDescription: (workspace) =>
      [workspace.personal ? 'personal' : '', workspace.id]
        .filter(Boolean)
        .join(' '),
    getLabel: (workspace) => workspace.name || workspace.id,
    items: workspaces,
    title: 'Select workspace',
  });
}

export async function chooseBoard(
  client: TuturuuuUserClient,
  workspaceId: string,
  config: CliConfig,
  json: boolean
) {
  ensureSelectable(json);
  const { boards } = await client.tasks.listBoards(workspaceId);

  return selectItem({
    defaultIndex: findDefaultIndex(
      boards,
      (board) => board.id === config.currentBoardId
    ),
    getBadge: (board) =>
      board.ticket_prefix
        ? color.blue(`[${escapeTerminalText(board.ticket_prefix)}]`)
        : undefined,
    getDescription: (board) => [board.id].filter(Boolean).join(' '),
    getLabel: (board) => board.name || board.id,
    items: boards,
    title: 'Select board',
  });
}

export async function chooseList(
  client: TuturuuuUserClient,
  workspaceId: string,
  boardId: string,
  config: CliConfig,
  json: boolean
) {
  ensureSelectable(json);
  const { lists } = await client.tasks.listLists(workspaceId, boardId);

  return selectItem({
    defaultIndex: findDefaultIndex(
      lists,
      (list) => list.id === config.currentListId
    ),
    getBadge: (list) =>
      [formatBadge(list.status), formatColorBadge(list.color)]
        .filter(Boolean)
        .join(' '),
    getDescription: (list) => [list.id].filter(Boolean).join(' '),
    getLabel: (list) => list.name || list.id,
    items: lists,
    title: 'Select list',
  });
}

async function chooseTask(
  client: TuturuuuUserClient,
  workspaceId: string,
  config: CliConfig,
  flags: Record<string, FlagValue>,
  json: boolean
) {
  ensureSelectable(json);
  const { tasks } = await client.tasks.list(workspaceId, {
    boardId: getFlag(flags, 'board') || config.currentBoardId,
    ...getTaskStateFilters(flags),
    includeDeleted: flags.deleted === true,
    limit: getFlag(flags, 'limit') ? Number(getFlag(flags, 'limit')) : 100,
    listId: getFlag(flags, 'list') || config.currentListId,
    q: getFlag(flags, 'q'),
  });

  return selectItem({
    defaultIndex: findDefaultIndex(
      tasks,
      (task) => task.id === config.currentTaskId
    ),
    getBadge: (task) =>
      task.ticket_prefix && task.display_number
        ? color.yellow(`[${task.ticket_prefix}-${task.display_number}]`)
        : undefined,
    getDescription: (task) =>
      [task.board_name || '', task.id].filter(Boolean).join(' '),
    getLabel: (task) => task.name || task.id,
    items: tasks,
    title: 'Select task',
  });
}

export async function chooseLabel(
  client: TuturuuuUserClient,
  workspaceId: string,
  config: CliConfig,
  json: boolean
) {
  ensureSelectable(json);
  const labels = await client.tasks.listLabels(workspaceId);

  return selectItem({
    defaultIndex: findDefaultIndex(
      labels,
      (label) => label.id === config.currentLabelId
    ),
    getBadge: (label) => formatBadge(label.color),
    getDescription: (label) => [label.id].filter(Boolean).join(' '),
    getLabel: (label) => label.name || label.id,
    items: labels,
    title: 'Select label',
  });
}

export async function chooseProject(
  client: TuturuuuUserClient,
  workspaceId: string,
  config: CliConfig,
  json: boolean
) {
  ensureSelectable(json);
  const projects = await client.tasks.listProjects(workspaceId);

  return selectItem({
    defaultIndex: findDefaultIndex(
      projects,
      (project) => project.id === config.currentProjectId
    ),
    getBadge: (project) => formatBadge(project.status),
    getDescription: (project) => [project.id].filter(Boolean).join(' '),
    getLabel: (project) => project.name || project.id,
    items: projects,
    title: 'Select project',
  });
}

export async function selectBoardId(
  client: TuturuuuUserClient,
  config: CliConfig,
  workspaceId: string,
  flags: Record<string, FlagValue>,
  json: boolean
) {
  const explicit = getFlag(flags, 'board') || getFlag(flags, 'board-id');
  if (explicit) return { boardId: explicit, config };
  if (config.currentBoardId) return { boardId: config.currentBoardId, config };

  const board = await chooseBoard(client, workspaceId, config, json);
  const nextConfig = {
    ...config,
    currentBoardId: board.id,
    currentListId: undefined,
    currentTaskId: undefined,
  };
  await writeCliConfig(nextConfig);
  return { boardId: board.id, config: nextConfig };
}

export async function selectListId(
  client: TuturuuuUserClient,
  config: CliConfig,
  workspaceId: string,
  flags: Record<string, FlagValue>,
  json: boolean
) {
  const explicit = getFlag(flags, 'list') || getFlag(flags, 'list-id');
  if (explicit) return { config, listId: explicit };
  if (config.currentListId) return { config, listId: config.currentListId };

  const boardSelection = await selectBoardId(
    client,
    config,
    workspaceId,
    flags,
    json
  );
  const list = await chooseList(
    client,
    workspaceId,
    boardSelection.boardId,
    boardSelection.config,
    json
  );
  const nextConfig = {
    ...boardSelection.config,
    currentListId: list.id,
    currentTaskId: undefined,
  };
  await writeCliConfig(nextConfig);
  return { config: nextConfig, listId: list.id };
}

export async function selectTaskId(
  client: TuturuuuUserClient,
  config: CliConfig,
  workspaceId: string,
  flags: Record<string, FlagValue>,
  json: boolean,
  explicit?: string
) {
  if (explicit) {
    return {
      config,
      taskId: await resolveTaskIdentifier(
        client,
        workspaceId,
        config,
        flags,
        explicit
      ),
    };
  }
  if (config.currentTaskId) return { config, taskId: config.currentTaskId };

  const task = await chooseTask(client, workspaceId, config, flags, json);
  const nextConfig = { ...config, currentTaskId: task.id };
  await writeCliConfig(nextConfig);
  return { config: nextConfig, taskId: task.id };
}
