import { spawn } from 'node:child_process';
import type {
  ListWorkspaceTasksOptions,
  SearchWorkspaceTasksPayload,
  WorkspaceTaskApiTask,
  WorkspaceTasksResponse,
} from '@tuturuuu/internal-api/tasks';
import packageJson from '../../package.json';
import { TuturuuuUserClient } from '../platform';
import {
  type FlagValue,
  getDefaultAction,
  getFlag,
  getTaskStateFilters,
  parseArgs,
  parseCsv,
} from './args';
import {
  buildLoginUrl,
  exchangeCliToken,
  readTokenFromStdin,
  receiveTokenFromBrowser,
} from './auth';
import { runCalendarCommand } from './calendar';
import {
  type CliConfig,
  clearHostScopedConfig,
  DEFAULT_BASE_URL,
  getDefaultConfigPath,
  normalizeHostBaseUrl,
  readCliConfig,
  resolveCliHostBaseUrl,
  resolveCliTasksBaseUrl,
  writeCliConfig,
} from './config';
import { runDevboxCommand } from './devbox';
import { runExternalProjectsCommand } from './external-projects';
import { runFinanceCommand } from './finance';
import { getGlobalHelp, getHelpOutput } from './help';
import {
  render,
  renderWhoami,
  sortTaskResponseForCli,
  sortTasksForCli,
} from './render';
import {
  chooseBoard,
  chooseLabel,
  chooseList,
  chooseProject,
  chooseWorkspace,
  getWorkspaceConfigId,
  type ListedBoard,
  type ListedLabel,
  type ListedList,
  type ListedProject,
  selectBoardId,
  selectListId,
  selectTaskId,
} from './selection';
import {
  getTaskDescriptionPayloadFromFlags,
  runTaskDescriptionCommand,
  shouldUseChunkedTaskDescriptionUpdate,
  updateTaskDescriptionWithBestTransport,
} from './task-description';
import {
  isLocalTaskTemplateReference,
  listLocalTaskTemplates,
  parseLocalTaskTemplateFile,
  resolveLocalTaskTemplatePath,
  taskTemplateToMarkdown,
  writeLocalTaskTemplate,
} from './task-templates';
import { runTiptapCommand } from './tiptap';
import { checkForCliUpdate, isCliUpdateCheckDisabled } from './update';

const doneActions = new Set(['complete', 'completed', 'done', 'mark-done']);
const closeActions = new Set(['archive', 'close', 'closed', 'mark-closed']);
const DEFAULT_TASK_PAGE_SIZE = 50;
const ACTIVE_TASK_LIST_STATUSES = ['not_started', 'active'] as const;
const DOCUMENT_TASK_LIST_STATUSES = ['documents'] as const;
const TASK_TEMPLATE_PRIORITIES = ['critical', 'high', 'normal', 'low'] as const;
const TASK_TEMPLATE_VISIBILITIES = ['private', 'workspace'] as const;

type TaskTemplatePriority = (typeof TASK_TEMPLATE_PRIORITIES)[number];
type TaskTemplateVisibility = (typeof TASK_TEMPLATE_VISIBILITIES)[number];
const REVIEW_TASK_LIST_STATUSES = ['review'] as const;
const DONE_TASK_LIST_STATUSES = ['review', 'done'] as const;
const CLOSED_TASK_LIST_STATUSES = ['closed'] as const;
const TASK_SEARCH_MODES = ['text', 'semantic', 'hybrid'] as const;
const LABEL_COLOR_ALIASES: Record<string, string> = {
  amber: '#D97706',
  blue: '#2563EB',
  cyan: '#0891B2',
  emerald: '#059669',
  gray: '#6B7280',
  green: '#16A34A',
  indigo: '#4F46E5',
  orange: '#EA580C',
  pink: '#DB2777',
  purple: '#7C3AED',
  red: '#DC2626',
  slate: '#475569',
  teal: '#0D9488',
  violet: '#7C3AED',
  yellow: '#CA8A04',
};

type ListedWorkspace = Awaited<
  ReturnType<TuturuuuUserClient['workspaces']['list']>
>[number];
type CliTask = WorkspaceTaskApiTask & {
  workspace_id?: string | null;
  workspace_name?: string | null;
};
type TaskSearchMode = (typeof TASK_SEARCH_MODES)[number];

interface TaskPaginationSummary {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  offset: number;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}

type CliListWorkspaceTasksOptions = ListWorkspaceTasksOptions & {
  includeArchivedBoards?: boolean;
  listStatuses?: string[];
};

type CliWorkspaceTasksResponse = WorkspaceTasksResponse & {
  pagination?: TaskPaginationSummary;
};

function upgradeCli() {
  process.stdout.write('Upgrading Tuturuuu CLI with Bun...\n');

  return new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['i', '-g', 'tuturuuu'], {
      shell: false,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Upgrade failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

function getWorkspaceId(config: CliConfig, flags: Record<string, FlagValue>) {
  const explicit = getFlag(flags, 'workspace') || getFlag(flags, 'ws');
  const workspaceId = explicit || config.currentWorkspaceId || 'personal';

  if (!workspaceId) {
    throw new Error(
      'No workspace selected. Use --workspace or run `ttr workspaces use <id>`.'
    );
  }

  return workspaceId;
}

function getBoardListStatus(
  flags: Record<string, FlagValue>
): 'active' | 'archived' | 'deleted' | 'all' {
  if (flags.all === true || flags['include-archived'] === true) return 'all';
  if (flags.archived === true) return 'archived';
  if (flags.deleted === true || flags['recently-deleted'] === true) {
    return 'deleted';
  }
  return 'active';
}

function resolveWorkspace(workspaceId: string, workspaces: ListedWorkspace[]) {
  return workspaces.find(
    (entry) =>
      entry.id === workspaceId ||
      (workspaceId === 'personal' && entry.personal === true)
  );
}

function hasTaskListScope(flags: Record<string, FlagValue>) {
  return Boolean(
    getFlag(flags, 'board') ||
      getFlag(flags, 'board-id') ||
      getFlag(flags, 'list') ||
      getFlag(flags, 'list-id')
  );
}

function hasWorkspaceScope(flags: Record<string, FlagValue>) {
  return Boolean(getFlag(flags, 'workspace') || getFlag(flags, 'ws'));
}

function shouldUseDefaultPersonalTaskScope(flags: Record<string, FlagValue>) {
  return !hasWorkspaceScope(flags) && !hasTaskListScope(flags);
}

function parsePositiveInteger(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeInteger(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseTaskSearchMode(flags: Record<string, FlagValue>): TaskSearchMode {
  const mode = getFlag(flags, 'mode') || 'hybrid';
  if (TASK_SEARCH_MODES.includes(mode as TaskSearchMode)) {
    return mode as TaskSearchMode;
  }

  throw new Error('Invalid task search mode. Use text, semantic, or hybrid.');
}

function parseTaskSearchPositiveInteger(
  value: string | undefined,
  flagName: string
) {
  if (!value) return undefined;
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) return parsed;

  throw new Error(`${flagName} must be a positive integer.`);
}

function parseTaskSearchThreshold(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);

  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }

  throw new Error('--threshold must be a number between 0 and 1.');
}

function parseTaskTemplatePriority(value: string | undefined) {
  if (!value) return undefined;
  if (TASK_TEMPLATE_PRIORITIES.includes(value as TaskTemplatePriority)) {
    return value as TaskTemplatePriority;
  }

  throw new Error(
    'Invalid task template priority. Use critical, high, normal, or low.'
  );
}

function parseTaskTemplateVisibility(value: string | undefined) {
  if (!value) return undefined;
  if (TASK_TEMPLATE_VISIBILITIES.includes(value as TaskTemplateVisibility)) {
    return value as TaskTemplateVisibility;
  }

  throw new Error(
    'Invalid task template visibility. Use private or workspace.'
  );
}

function getTaskPagination(flags: Record<string, FlagValue>) {
  const limit =
    parsePositiveInteger(getFlag(flags, 'limit')) ??
    parsePositiveInteger(getFlag(flags, 'page-size')) ??
    DEFAULT_TASK_PAGE_SIZE;
  const page = parsePositiveInteger(getFlag(flags, 'page'));
  const offset =
    parseNonNegativeInteger(getFlag(flags, 'offset')) ??
    (page ? (page - 1) * limit : 0);

  return { limit, offset };
}

function hasExplicitTaskListStatusFlag(flags: Record<string, FlagValue>) {
  return (
    flags.all === true ||
    flags.document === true ||
    flags.documents === true ||
    flags.review === true ||
    flags.done === true ||
    flags.completed === true ||
    flags.closed === true ||
    flags['include-documents'] === true ||
    flags['include-review'] === true ||
    flags['include-done'] === true ||
    flags['include-closed'] === true
  );
}

function getCliTaskListStatuses(flags: Record<string, FlagValue>) {
  if (flags.all === true) return undefined;

  if (flags.document === true || flags.documents === true) {
    return [...DOCUMENT_TASK_LIST_STATUSES];
  }

  if (flags.review === true) {
    return [...REVIEW_TASK_LIST_STATUSES];
  }

  if (flags.done === true || flags.completed === true) {
    return [...DONE_TASK_LIST_STATUSES];
  }

  if (flags.closed === true) {
    return [...CLOSED_TASK_LIST_STATUSES];
  }

  if (
    (getFlag(flags, 'list') || getFlag(flags, 'list-id')) &&
    !hasExplicitTaskListStatusFlag(flags)
  ) {
    return undefined;
  }

  const statuses = new Set<string>(ACTIVE_TASK_LIST_STATUSES);

  if (flags['include-documents'] === true) {
    for (const status of DOCUMENT_TASK_LIST_STATUSES) statuses.add(status);
  }

  if (flags['include-review'] === true) {
    for (const status of REVIEW_TASK_LIST_STATUSES) statuses.add(status);
  }

  if (flags['include-done'] === true) {
    for (const status of DONE_TASK_LIST_STATUSES) statuses.add(status);
  }

  if (flags['include-closed'] === true) {
    for (const status of CLOSED_TASK_LIST_STATUSES) statuses.add(status);
  }

  return [...statuses];
}

function getCliTaskStateFilters(
  flags: Record<string, FlagValue>
): Pick<ListWorkspaceTasksOptions, 'closed' | 'completed'> {
  if (
    flags.document === true ||
    flags.documents === true ||
    flags.review === true ||
    flags.done === true ||
    flags.completed === true ||
    flags.closed === true
  ) {
    return {};
  }

  return getTaskStateFilters(flags);
}

function getCliTaskListOptions(
  flags: Record<string, FlagValue>
): CliListWorkspaceTasksOptions {
  const pagination = getTaskPagination(flags);
  const listStatuses = getCliTaskListStatuses(flags);
  const activeStatusesOnly =
    listStatuses?.length === ACTIVE_TASK_LIST_STATUSES.length &&
    ACTIVE_TASK_LIST_STATUSES.every((status) => listStatuses.includes(status));
  const includesDocuments = listStatuses?.includes('documents') ?? false;
  const resolvedStatuses: readonly string[] = [
    ...REVIEW_TASK_LIST_STATUSES,
    ...DONE_TASK_LIST_STATUSES,
    ...CLOSED_TASK_LIST_STATUSES,
  ];
  const includesResolved =
    listStatuses?.some((status) => resolvedStatuses.includes(status)) ?? false;

  return {
    boardId: getFlag(flags, 'board') || getFlag(flags, 'board-id'),
    ...getCliTaskStateFilters(flags),
    externalIncludeDocuments: includesDocuments,
    externalIncludeDoneClosed: includesResolved,
    forTimeTracking:
      activeStatusesOnly &&
      !(getFlag(flags, 'list') || getFlag(flags, 'list-id')),
    includeArchivedBoards:
      flags.all === true || flags['include-archived'] === true,
    includeCount: true,
    includeDeleted: flags.deleted === true,
    limit: pagination.limit,
    listId: getFlag(flags, 'list') || getFlag(flags, 'list-id'),
    listStatuses,
    offset: pagination.offset,
    q: getFlag(flags, 'q'),
  };
}

function getCliTaskSearchPayload(
  flags: Record<string, FlagValue>,
  positionals: string[]
): SearchWorkspaceTasksPayload {
  const query =
    getFlag(flags, 'query') ||
    getFlag(flags, 'q') ||
    positionals.slice(2).join(' ');
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new Error(
      'Missing search query. Use `ttr tasks search <query>` or --query.'
    );
  }

  const matchCount = parseTaskSearchPositiveInteger(
    getFlag(flags, 'match-count') || getFlag(flags, 'limit'),
    '--match-count'
  );
  const matchThreshold = parseTaskSearchThreshold(
    getFlag(flags, 'match-threshold') || getFlag(flags, 'threshold')
  );

  return {
    ...(matchCount !== undefined ? { matchCount } : {}),
    ...(matchThreshold !== undefined ? { matchThreshold } : {}),
    mode: parseTaskSearchMode(flags),
    query: trimmedQuery,
  };
}

function getTaskListStatus(task: WorkspaceTaskApiTask) {
  const taskWithRelations = task as WorkspaceTaskApiTask & {
    task_lists?: { status?: string | null } | null;
  };

  return (
    task.source_list_status ?? taskWithRelations.task_lists?.status ?? null
  );
}

function filterTasksByListStatuses(
  tasks: WorkspaceTaskApiTask[],
  statuses: string[] | undefined
) {
  if (!statuses) return tasks;
  const allowedStatuses = new Set(statuses);
  return tasks.filter((task) => {
    const status = getTaskListStatus(task);
    return status ? allowedStatuses.has(status) : true;
  });
}

function getTaskPaginationSummary({
  limit,
  offset,
  total,
}: {
  limit: number;
  offset: number;
  total: number;
}): TaskPaginationSummary {
  const pageSize = Math.max(1, limit);
  const page = Math.floor(Math.max(0, offset) / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    hasNextPage: offset + pageSize < total,
    hasPreviousPage: offset > 0,
    offset,
    page,
    pageCount,
    pageSize,
    total,
  };
}

function withTaskPagination(
  response: WorkspaceTasksResponse,
  tasks: WorkspaceTaskApiTask[],
  total: number,
  limit: number,
  offset: number
): WorkspaceTasksResponse & { pagination: TaskPaginationSummary } {
  return {
    ...response,
    count: total,
    pagination: getTaskPaginationSummary({ limit, offset, total }),
    tasks,
  };
}

function annotateTaskWorkspace(
  task: WorkspaceTaskApiTask,
  workspace: ListedWorkspace,
  options: { source?: boolean } = {}
): CliTask {
  return {
    ...task,
    ...(options.source
      ? {
          source_workspace_id: task.source_workspace_id ?? workspace.id,
          source_workspace_name: task.source_workspace_name ?? workspace.name,
        }
      : {}),
    workspace_id: workspace.id,
    workspace_name: workspace.name,
  };
}

function shouldIncludeAssignedExternalTasks(
  workspace: ListedWorkspace | undefined,
  flags: Record<string, FlagValue>
) {
  if (!workspace?.personal) return false;
  if (getFlag(flags, 'workspace') || getFlag(flags, 'ws')) return false;
  return !hasTaskListScope(flags);
}

export async function listTasksForCli(
  client: TuturuuuUserClient,
  _config: CliConfig,
  workspaceId: string,
  flags: Record<string, FlagValue>
): Promise<{ response: CliWorkspaceTasksResponse; workspaceName?: string }> {
  const options = getCliTaskListOptions(flags);
  const workspaces = await client.workspaces.list();
  const requestedWorkspace = resolveWorkspace(workspaceId, workspaces);
  const personalWorkspace = workspaces.find((workspace) => workspace.personal);
  const currentWorkspace =
    shouldUseDefaultPersonalTaskScope(flags) && personalWorkspace
      ? personalWorkspace
      : requestedWorkspace;
  const effectiveWorkspaceId = currentWorkspace?.id ?? workspaceId;
  const workspaceName = currentWorkspace?.name || workspaceId;
  const fallbackWorkspace = {
    id: effectiveWorkspaceId,
    name: workspaceName,
  } as ListedWorkspace;
  const shouldIncludeExternalTasks = shouldIncludeAssignedExternalTasks(
    currentWorkspace,
    flags
  );
  const paginationLimit =
    typeof options.limit === 'number' ? options.limit : DEFAULT_TASK_PAGE_SIZE;
  const paginationOffset =
    typeof options.offset === 'number' ? options.offset : 0;
  const fetchWindowLimit = shouldIncludeExternalTasks
    ? paginationLimit + paginationOffset
    : paginationLimit;
  const fetchOptions = shouldIncludeExternalTasks
    ? { ...options, limit: fetchWindowLimit, offset: 0 }
    : options;
  const baseResponse = await client.tasks.list(
    effectiveWorkspaceId,
    fetchOptions
  );
  const listStatuses = getCliTaskListStatuses(flags);
  const filteredBaseTasks = filterTasksByListStatuses(
    baseResponse.tasks,
    listStatuses
  );

  if (!shouldIncludeExternalTasks || !currentWorkspace) {
    return {
      response: {
        ...withTaskPagination(
          baseResponse,
          filteredBaseTasks.map((task) =>
            annotateTaskWorkspace(task, currentWorkspace ?? fallbackWorkspace)
          ),
          baseResponse.count ?? filteredBaseTasks.length,
          paginationLimit,
          paginationOffset
        ),
      },
      workspaceName,
    };
  }

  const baseTaskIds = new Set(filteredBaseTasks.map((task) => task.id));
  const externalWorkspaces = workspaces.filter(
    (workspace) => !workspace.personal && workspace.id !== currentWorkspace.id
  );
  const externalResponses = await Promise.all(
    externalWorkspaces.map(async (workspace) => ({
      workspace,
      response: await client.tasks.list(workspace.id, {
        ...fetchOptions,
        assignedToMe: true,
        boardId: undefined,
        listId: undefined,
      }),
    }))
  );
  const externalTasks = externalResponses.flatMap(({ response, workspace }) =>
    filterTasksByListStatuses(response.tasks, listStatuses)
      .filter((task) => !baseTaskIds.has(task.id))
      .map((task) => annotateTaskWorkspace(task, workspace, { source: true }))
  );
  const baseTasks = filteredBaseTasks.map((task) =>
    annotateTaskWorkspace(task, currentWorkspace)
  );
  const combinedTasks = [...baseTasks, ...externalTasks];
  const tasks = sortTasksForCli(combinedTasks).slice(
    paginationOffset,
    paginationOffset + paginationLimit
  ) as WorkspaceTaskApiTask[];
  const total =
    typeof baseResponse.count === 'number' ||
    externalResponses.some(({ response }) => typeof response.count === 'number')
      ? (baseResponse.count ?? baseTasks.length) +
        externalResponses.reduce(
          (sum, { response }) =>
            sum + (response.count ?? response.tasks.length),
          0
        )
      : undefined;

  return {
    response: withTaskPagination(
      baseResponse,
      tasks,
      total ?? combinedTasks.length,
      paginationLimit,
      paginationOffset
    ),
    workspaceName,
  };
}

export async function searchTasksForCli(
  client: TuturuuuUserClient,
  _config: CliConfig,
  workspaceId: string,
  flags: Record<string, FlagValue>,
  positionals: string[]
): Promise<{
  response: Awaited<ReturnType<TuturuuuUserClient['tasks']['search']>>;
  workspaceName?: string;
}> {
  const payload = getCliTaskSearchPayload(flags, positionals);
  const workspaces = await client.workspaces.list();
  const requestedWorkspace = resolveWorkspace(workspaceId, workspaces);
  const personalWorkspace = workspaces.find((workspace) => workspace.personal);
  const currentWorkspace =
    shouldUseDefaultPersonalTaskScope(flags) && personalWorkspace
      ? personalWorkspace
      : requestedWorkspace;
  const effectiveWorkspaceId = currentWorkspace?.id ?? workspaceId;
  const workspaceName = currentWorkspace?.name || workspaceId;
  const response = await client.tasks.search(effectiveWorkspaceId, payload);

  return {
    response: {
      ...response,
      tasks: response.tasks.map((task) => ({
        ...task,
        workspace_id: effectiveWorkspaceId,
        workspace_name: workspaceName,
      })),
    },
    workspaceName,
  };
}

function getClient(config: CliConfig) {
  if (!config.session?.accessToken || !config.session.refreshToken) {
    throw new Error('Not logged in. Run `ttr login` first.');
  }

  return new TuturuuuUserClient({
    accessToken: config.session.accessToken,
    baseUrl: config.baseUrl,
    expiresAt: config.session.expiresAt,
    onSessionRefresh: async (session) => {
      await writeCliConfig({ ...config, session });
    },
    refreshToken: config.session.refreshToken,
    tasksBaseUrl: config.tasksBaseUrl ?? resolveCliTasksBaseUrl(config.baseUrl),
  });
}

async function saveSession(config: CliConfig, token: string) {
  const payload = await exchangeCliToken({
    baseUrl: config.baseUrl,
    token,
  });
  const session = {
    accessToken: payload.session.access_token,
    expiresAt: payload.session.expires_at,
    refreshExpiresAt: payload.session.refresh_expires_at,
    refreshToken: payload.session.refresh_token,
    tokenType: payload.session.token_type,
  };
  const nextConfig: CliConfig = {
    ...config,
    currentBoardId: undefined,
    currentLabelId: undefined,
    currentListId: undefined,
    currentProjectId: undefined,
    currentTaskId: undefined,
    currentWorkspaceId: 'personal',
    session,
  };
  await writeCliConfig(nextConfig);

  const email =
    payload.email ??
    (await new TuturuuuUserClient({
      accessToken: session.accessToken,
      baseUrl: nextConfig.baseUrl,
      expiresAt: session.expiresAt,
      refreshToken: session.refreshToken,
      tasksBaseUrl:
        nextConfig.tasksBaseUrl ?? resolveCliTasksBaseUrl(nextConfig.baseUrl),
    }).users
      .profile()
      .then((profile) => profile.email)
      .catch(() => null));

  process.stdout.write(
    `${[
      email
        ? `Logged in as ${email}.`
        : 'Logged in with your Tuturuuu account.',
      'Session: Tuturuuu CLI',
      'Current workspace: personal',
      `Config: ${getDefaultConfigPath()}`,
    ].join('\n')}\n`
  );
}

async function login(flags: Record<string, FlagValue>, config: CliConfig) {
  config.baseUrl = normalizeHostBaseUrl(
    getFlag(flags, 'base-url') || config.baseUrl
  );
  const directToken = getFlag(flags, 'token');

  if (directToken) {
    await saveSession(config, directToken);
    return;
  }

  if (flags.copy) {
    const state = crypto.randomUUID();
    const url = buildLoginUrl({
      baseUrl: config.baseUrl,
      mode: 'copy',
      state,
    });
    process.stdout.write(
      `Open this URL, copy the token, then paste it below:\n${url}\n`
    );
    await saveSession(config, await readTokenFromStdin());
    return;
  }

  await saveSession(config, await receiveTokenFromBrowser(config.baseUrl));
}

function getHostSwitchPort(flags: Record<string, FlagValue>) {
  return getFlag(flags, 'port');
}

async function runHostCommand({
  action,
  config,
  firstId,
  flags,
  json,
}: {
  action?: string;
  config: CliConfig;
  firstId?: string;
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  if (action === 'current' || !action) {
    render(
      {
        baseUrl: config.baseUrl,
        configPath: getDefaultConfigPath(),
      },
      { group: 'host', json }
    );
    return;
  }

  if (action === 'list') {
    const localBaseUrl = resolveCliHostBaseUrl('local', {
      env: process.env,
      port: getHostSwitchPort(flags),
      portless: flags.portless === true,
    });

    render(
      [
        {
          alias: 'production',
          baseUrl: DEFAULT_BASE_URL,
          current: normalizeHostBaseUrl(config.baseUrl) === DEFAULT_BASE_URL,
        },
        {
          alias: 'local',
          baseUrl: localBaseUrl,
          current: normalizeHostBaseUrl(config.baseUrl) === localBaseUrl,
        },
      ],
      { group: 'host', json }
    );
    return;
  }

  if (action === 'use') {
    if (!firstId) {
      throw new Error(
        'Missing host target. Use production, prod, local, localhost, or a URL.'
      );
    }

    const nextBaseUrl = resolveCliHostBaseUrl(firstId, {
      env: process.env,
      port: getHostSwitchPort(flags),
      portless: flags.portless === true,
    });
    const nextConfig = clearHostScopedConfig(config, nextBaseUrl);
    const changed =
      normalizeHostBaseUrl(config.baseUrl) !==
      normalizeHostBaseUrl(nextBaseUrl);
    await writeCliConfig(nextConfig);

    if (json) {
      render(
        {
          baseUrl: nextConfig.baseUrl,
          changed,
          contextCleared: changed,
        },
        { group: 'host', json }
      );
      return;
    }

    process.stdout.write(
      `${[
        `Host set to ${nextConfig.baseUrl}`,
        changed
          ? 'Saved session and selected workspace context were cleared.'
          : null,
      ]
        .filter(Boolean)
        .join('\n')}\n`
    );
    return;
  }

  throw new Error(`Unknown host action: ${action}`);
}

function getPayload(flags: Record<string, FlagValue>) {
  const payload = getFlag(flags, 'json-payload');
  return payload ? (JSON.parse(payload) as Record<string, unknown>) : {};
}

export function getTaskUpdatePayload(flags: Record<string, FlagValue>) {
  const payload = getPayload(flags);
  const listId = getFlag(flags, 'list') || getFlag(flags, 'list-id');

  if (listId && payload.list_id === undefined) {
    payload.list_id = listId;
  }

  if (
    payload.completed === true &&
    payload.completed_at === undefined &&
    payload.closed_at === undefined
  ) {
    payload.completed_at = new Date().toISOString();
  }

  return payload;
}

export function getTaskDonePayload(
  flags: Record<string, FlagValue>,
  listId?: string
) {
  const payload = getPayload(flags);
  const explicitListId =
    listId || getFlag(flags, 'list') || getFlag(flags, 'list-id');

  payload.completed = true;

  if (payload.completed_at === undefined) {
    payload.completed_at = new Date().toISOString();
  }

  if (explicitListId && payload.list_id === undefined) {
    payload.list_id = explicitListId;
  }

  return payload;
}

export function getTaskClosePayload(
  flags: Record<string, FlagValue>,
  listId?: string
) {
  const payload = getPayload(flags);
  const explicitListId =
    listId || getFlag(flags, 'list') || getFlag(flags, 'list-id');

  payload.completed = false;

  if (payload.completed_at === undefined) {
    payload.completed_at = null;
  }

  if (payload.closed_at === undefined) {
    payload.closed_at = new Date().toISOString();
  }

  if (explicitListId && payload.list_id === undefined) {
    payload.list_id = explicitListId;
  }

  return payload;
}

function getTaskTemplatePayloadFromFlags(
  flags: Record<string, FlagValue>,
  fallbackName?: string
) {
  const payload = getPayload(flags);
  const priority = parseTaskTemplatePriority(getFlag(flags, 'priority'));
  const visibility = parseTaskTemplateVisibility(getFlag(flags, 'visibility'));
  const name =
    getFlag(flags, 'name') || getFlag(flags, 'template-name') || fallbackName;
  const taskName =
    getFlag(flags, 'title') || getFlag(flags, 'task-name') || fallbackName;

  return {
    ...payload,
    ...(getFlag(flags, 'assignees')
      ? { assignee_ids: parseCsv(getFlag(flags, 'assignees')) }
      : {}),
    ...(getFlag(flags, 'board') || getFlag(flags, 'board-id')
      ? {
          default_board_id:
            getFlag(flags, 'board') || getFlag(flags, 'board-id'),
        }
      : {}),
    ...(getFlag(flags, 'description')
      ? { description: getFlag(flags, 'description') }
      : {}),
    ...(getFlag(flags, 'end-date')
      ? { end_date: getFlag(flags, 'end-date') }
      : {}),
    ...(getFlag(flags, 'estimate') || getFlag(flags, 'estimation-points')
      ? {
          estimation_points: Number(
            getFlag(flags, 'estimate') || getFlag(flags, 'estimation-points')
          ),
        }
      : {}),
    ...(getFlag(flags, 'key') || getFlag(flags, 'slug')
      ? { key: getFlag(flags, 'key') || getFlag(flags, 'slug') }
      : {}),
    ...(getFlag(flags, 'labels')
      ? { label_ids: parseCsv(getFlag(flags, 'labels')) }
      : {}),
    ...(getFlag(flags, 'list') || getFlag(flags, 'list-id')
      ? { default_list_id: getFlag(flags, 'list') || getFlag(flags, 'list-id') }
      : {}),
    ...(name ? { name } : {}),
    ...(priority ? { priority } : {}),
    ...(getFlag(flags, 'projects')
      ? { project_ids: parseCsv(getFlag(flags, 'projects')) }
      : {}),
    ...(getFlag(flags, 'start-date')
      ? { start_date: getFlag(flags, 'start-date') }
      : {}),
    ...(taskName ? { task_name: taskName } : {}),
    ...(visibility ? { visibility } : {}),
  };
}

function getTaskTemplateCreateOverrides(
  flags: Record<string, FlagValue>,
  listId: string,
  fallbackName?: string
) {
  const payload = getPayload(flags);
  const priority = parseTaskTemplatePriority(getFlag(flags, 'priority'));
  return {
    ...payload,
    ...(getFlag(flags, 'assignees')
      ? { assignee_ids: parseCsv(getFlag(flags, 'assignees')) }
      : {}),
    ...(getFlag(flags, 'end-date')
      ? { end_date: getFlag(flags, 'end-date') }
      : {}),
    ...(getFlag(flags, 'description')
      ? { description: getFlag(flags, 'description') }
      : {}),
    ...(getFlag(flags, 'estimate') || getFlag(flags, 'estimation-points')
      ? {
          estimation_points: Number(
            getFlag(flags, 'estimate') || getFlag(flags, 'estimation-points')
          ),
        }
      : {}),
    ...(getFlag(flags, 'labels')
      ? { label_ids: parseCsv(getFlag(flags, 'labels')) }
      : {}),
    listId,
    ...(getFlag(flags, 'name') || fallbackName
      ? { name: getFlag(flags, 'name') || fallbackName }
      : {}),
    ...(priority ? { priority } : {}),
    ...(getFlag(flags, 'projects')
      ? { project_ids: parseCsv(getFlag(flags, 'projects')) }
      : {}),
    ...(getFlag(flags, 'start-date')
      ? { start_date: getFlag(flags, 'start-date') }
      : {}),
  };
}

async function createTaskFromLocalTemplate({
  client,
  flags,
  listId,
  reference,
  workspaceId,
}: {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  listId: string;
  reference: string;
  workspaceId: string;
}) {
  const localTemplate = parseLocalTaskTemplateFile(
    resolveLocalTaskTemplatePath(reference)
  );
  const overrides = getTaskTemplateCreateOverrides(flags, listId);
  const hasDescriptionOverride =
    Object.hasOwn(overrides, 'description') ||
    Object.hasOwn(overrides, 'description_yjs_state');
  return client.tasks.create(workspaceId, {
    assignee_ids: localTemplate.payload.assignee_ids ?? [],
    description: localTemplate.payload.description ?? null,
    description_yjs_state: hasDescriptionOverride
      ? null
      : (localTemplate.payload.description_yjs_state ?? null),
    end_date: localTemplate.payload.end_date ?? null,
    estimation_points: localTemplate.payload.estimation_points ?? null,
    label_ids: localTemplate.payload.label_ids ?? [],
    name:
      typeof overrides.name === 'string'
        ? overrides.name
        : (localTemplate.payload.task_name ?? localTemplate.payload.name),
    priority: localTemplate.payload.priority ?? null,
    project_ids: localTemplate.payload.project_ids ?? [],
    start_date: localTemplate.payload.start_date ?? null,
    ...overrides,
    listId,
  });
}

async function getDefaultStatusListId({
  client,
  config,
  flags,
  json,
  status,
  taskId,
  workspaceId,
}: {
  client: TuturuuuUserClient;
  config: CliConfig;
  flags: Record<string, FlagValue>;
  json: boolean;
  status: 'closed' | 'done';
  taskId: string;
  workspaceId: string;
}) {
  const explicitListId = getFlag(flags, 'list') || getFlag(flags, 'list-id');
  if (explicitListId) {
    return explicitListId;
  }

  const task = await client.tasks.get(workspaceId, taskId);
  const boardId =
    getFlag(flags, 'board') || task.task.board_id || config.currentBoardId;

  if (!boardId) {
    if (json) {
      return undefined;
    }

    const listSelection = await selectListId(
      client,
      config,
      workspaceId,
      flags,
      json
    );
    return listSelection.listId;
  }

  const { lists } = await client.tasks.listLists(workspaceId, boardId);
  return lists.find((list) => list.status === status)?.id;
}

async function renderTaskMutationResult({
  client,
  displayKey,
  fallback,
  group,
  json,
  taskId,
  workspaceId,
}: {
  client: TuturuuuUserClient;
  displayKey?: string;
  fallback: unknown;
  group: string;
  json: boolean;
  taskId: string;
  workspaceId: string;
}) {
  if (json) {
    render(fallback, { group, json });
    return;
  }

  try {
    render(
      withTaskDisplayKey(
        await client.tasks.get(workspaceId, taskId),
        displayKey
      ),
      {
        group,
        json,
      }
    );
  } catch {
    render(withTaskDisplayKey(fallback, displayKey), { group, json });
  }
}

function getIdentifierDisplayKey(identifier?: string) {
  const value = identifier?.trim();
  return value && /^[a-z][a-z0-9]*-\d+$/i.test(value)
    ? value.toUpperCase()
    : undefined;
}

function withTaskDisplayKey(data: unknown, displayKey?: string) {
  if (!displayKey || !data || typeof data !== 'object') return data;
  const record = data as { task?: unknown };
  if (!record.task || typeof record.task !== 'object') return data;
  return {
    ...record,
    task: {
      ...(record.task as Record<string, unknown>),
      display_key: displayKey,
    },
  };
}

export function normalizeLabelColor(value?: string) {
  const color = (value || 'gray').trim();

  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u.test(color)) {
    return color;
  }

  return LABEL_COLOR_ALIASES[color.toLowerCase()] ?? color;
}

export async function runCli(argv = process.argv.slice(2)) {
  const commandSeparatorIndex = argv.indexOf('--');
  const globalArgs =
    commandSeparatorIndex >= 0 ? argv.slice(0, commandSeparatorIndex) : argv;

  if (globalArgs.includes('-v') || globalArgs.includes('--version')) {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  const { flags, positionals } = parseArgs(argv);
  const [rawGroup, rawAction, rawFirstId] = positionals;
  const group = rawGroup === 'devbox' ? 'box' : rawGroup;
  const helpRequested =
    flags.help === true ||
    argv.includes('-h') ||
    group === 'help' ||
    rawAction === 'help';
  if (helpRequested) {
    const helpGroup = group === 'help' ? rawAction : group;
    const helpAction =
      group === 'help'
        ? rawFirstId
        : rawAction === 'help'
          ? rawFirstId
          : rawAction;
    process.stdout.write(getHelpOutput(helpGroup, helpAction));
    return;
  }

  const positionalValue = positionals.slice(2).join(' ').trim();
  const relationshipAction =
    group === 'relationships' &&
    rawAction &&
    !['create', 'delete', 'list'].includes(rawAction)
      ? 'list'
      : undefined;
  const action = relationshipAction || rawAction || getDefaultAction(group);
  const firstId = relationshipAction ? rawAction : rawFirstId;
  const json = flags.json === true;

  if (!group) {
    process.stdout.write(getGlobalHelp());
    return;
  }

  if (group === 'upgrade') {
    await upgradeCli();
    return;
  }

  if (group === 'tiptap') {
    await runTiptapCommand({ action: rawAction, flags, json });
    return;
  }

  let config = await readCliConfig();
  if (flags['no-update-check'] !== true && !isCliUpdateCheckDisabled()) {
    const nextConfig = await checkForCliUpdate({
      config,
      currentVersion: packageJson.version,
    });
    if (nextConfig !== config) {
      await writeCliConfig(nextConfig);
      config = nextConfig;
    }
  }

  if (group === 'login') {
    await login(flags, config);
    return;
  }

  if (group === 'logout') {
    await writeCliConfig({ baseUrl: config.baseUrl || DEFAULT_BASE_URL });
    process.stdout.write('Logged out.\n');
    return;
  }

  if (group === 'host') {
    await runHostCommand({ action, config, firstId, flags, json });
    return;
  }

  if (group === 'whoami') {
    const loggedIn = !!config.session?.accessToken;
    let profile = null;
    let currentWorkspace = null;
    let defaultWorkspace = null;

    if (loggedIn) {
      const client = getClient(config);
      const currentWorkspaceId = config.currentWorkspaceId || 'personal';
      const [loadedProfile, loadedDefaultWorkspace, workspaces] =
        await Promise.all([
          client.users.profile(),
          client.users.defaultWorkspace(),
          client.workspaces.list(),
        ]);
      profile = loadedProfile;
      defaultWorkspace = loadedDefaultWorkspace;
      currentWorkspace = currentWorkspaceId
        ? (workspaces.find(
            (workspace) =>
              workspace.id === currentWorkspaceId ||
              (currentWorkspaceId === 'personal' && workspace.personal === true)
          ) ?? {
            id: currentWorkspaceId,
            name: currentWorkspaceId,
          })
        : null;
    }

    renderWhoami(
      {
        baseUrl: config.baseUrl,
        configPath: getDefaultConfigPath(),
        currentBoardId: config.currentBoardId,
        currentLabelId: config.currentLabelId,
        currentListId: config.currentListId,
        currentProjectId: config.currentProjectId,
        currentTaskId: config.currentTaskId,
        currentWorkspace,
        currentWorkspaceId: config.currentWorkspaceId || 'personal',
        defaultWorkspace,
        loggedIn,
        session: config.session ? 'Tuturuuu CLI' : null,
        user: profile,
      },
      json
    );
    return;
  }

  if (group === 'config' && action === 'set-base-url' && firstId) {
    const nextBaseUrl = normalizeHostBaseUrl(firstId);
    const nextConfig = clearHostScopedConfig(config, nextBaseUrl);
    await writeCliConfig(nextConfig);
    process.stdout.write(`Base URL set to ${nextConfig.baseUrl}\n`);
    return;
  }

  if (group === 'box') {
    const client =
      action === 'doctor' ||
      action === 'repair' ||
      (action === 'agent' && firstId === 'start')
        ? undefined
        : action === 'setup'
          ? config.session
            ? getClient(config)
            : undefined
          : getClient(config);
    await runDevboxCommand({
      action,
      argv,
      baseUrl: config.baseUrl,
      client,
      flags,
      json,
    });
    return;
  }

  const client = getClient(config);

  if (group === 'workspaces') {
    if (action === 'list') {
      render(await client.workspaces.list(), {
        currentWorkspaceId: config.currentWorkspaceId || 'personal',
        group,
        json,
      });
      return;
    }

    if (action === 'use') {
      const workspace = firstId
        ? null
        : await chooseWorkspace(client, config, json);
      const nextWorkspaceId = workspace
        ? getWorkspaceConfigId(workspace)
        : firstId;
      if (!nextWorkspaceId) throw new Error('Missing workspace id.');
      config = {
        ...config,
        currentBoardId: undefined,
        currentLabelId: undefined,
        currentListId: undefined,
        currentProjectId: undefined,
        currentTaskId: undefined,
        currentWorkspaceId: nextWorkspaceId,
      };
      await writeCliConfig(config);
      process.stdout.write(`Current workspace set to ${nextWorkspaceId}\n`);
      return;
    }
  }

  const workspaceId = getWorkspaceId(config, flags);

  if (group === 'external') {
    if (action !== 'projects') {
      throw new Error('Unknown command. Use `ttr external projects --help`.');
    }

    await runExternalProjectsCommand({
      client,
      flags,
      json,
      positionals: positionals.slice(2),
      workspaceId,
    });
    return;
  }

  if (group === 'calendar') {
    await runCalendarCommand({
      client,
      flags,
      json,
      positionals,
      workspaceId,
    });
    return;
  }

  if (group === 'boards') {
    if (action === 'list') {
      render(
        await client.tasks.listBoards(workspaceId, {
          page: getFlag(flags, 'page')
            ? Number(getFlag(flags, 'page'))
            : undefined,
          pageSize: getFlag(flags, 'page-size')
            ? Number(getFlag(flags, 'page-size'))
            : undefined,
          q: getFlag(flags, 'q'),
          status: getBoardListStatus(flags),
        }),
        { group, json }
      );
      return;
    }
    if (action === 'use' || action === 'select') {
      const board = firstId
        ? ({ id: firstId } as ListedBoard)
        : await chooseBoard(client, workspaceId, config, json);
      config = {
        ...config,
        currentBoardId: board.id,
        currentListId: undefined,
        currentTaskId: undefined,
      };
      await writeCliConfig(config);
      process.stdout.write(`Current board set to ${board.id}\n`);
      return;
    }
    if (action === 'create') {
      render(
        await client.tasks.createBoard(workspaceId, {
          icon: (getFlag(flags, 'icon') || null) as never,
          name: getFlag(flags, 'name') || positionalValue || 'Untitled Board',
          template_id: getFlag(flags, 'template-id'),
        }),
        { group, json }
      );
      return;
    }
    if (action === 'update') {
      const selection = firstId
        ? { boardId: firstId, config }
        : await selectBoardId(client, config, workspaceId, flags, json);
      config = selection.config;
      render(
        await client.tasks.updateBoard(
          workspaceId,
          selection.boardId,
          getPayload(flags)
        ),
        { group, json }
      );
      return;
    }
    if (action === 'delete') {
      const selection = firstId
        ? { boardId: firstId, config }
        : await selectBoardId(client, config, workspaceId, flags, json);
      config = {
        ...selection.config,
        currentBoardId: undefined,
        currentListId: undefined,
        currentTaskId: undefined,
      };
      await writeCliConfig(config);
      render(await client.tasks.deleteBoard(workspaceId, selection.boardId), {
        group,
        json,
      });
      return;
    }
  }

  if (group === 'lists') {
    const boardSelection = await selectBoardId(
      client,
      config,
      workspaceId,
      flags,
      json
    );
    config = boardSelection.config;
    const boardId = boardSelection.boardId;
    if (action === 'list') {
      render(await client.tasks.listLists(workspaceId, boardId), {
        group,
        json,
      });
      return;
    }
    if (action === 'use' || action === 'select') {
      const list = firstId
        ? ({ id: firstId } as ListedList)
        : await chooseList(client, workspaceId, boardId, config, json);
      config = {
        ...config,
        currentBoardId: boardId,
        currentListId: list.id,
        currentTaskId: undefined,
      };
      await writeCliConfig(config);
      process.stdout.write(`Current list set to ${list.id}\n`);
      return;
    }
    if (action === 'create') {
      render(
        await client.tasks.createList(workspaceId, boardId, {
          color: getFlag(flags, 'color'),
          name: getFlag(flags, 'name') || positionalValue || 'Untitled List',
          status: getFlag(flags, 'status'),
        }),
        { group, json }
      );
      return;
    }
    if (action === 'update') {
      const listSelection = firstId
        ? { config, listId: firstId }
        : await selectListId(client, config, workspaceId, flags, json);
      config = listSelection.config;
      render(
        await client.tasks.updateList(
          workspaceId,
          boardId,
          listSelection.listId,
          getPayload(flags)
        ),
        { group, json }
      );
      return;
    }
  }

  if (group === 'task-templates') {
    if (action === 'list') {
      if (flags.local === true) {
        const localTemplates = listLocalTaskTemplates().map((template) => ({
          path: template.path,
          ...template.payload,
        }));
        render(localTemplates, { group, json });
        return;
      }

      const payload = await client.tasks.listTemplates(workspaceId, {
        includeArchived: flags.all === true || flags.archived === true,
        q: getFlag(flags, 'q'),
        visibility: getFlag(flags, 'visibility') as never,
      });
      render(json ? payload : payload.templates, { group, json });
      return;
    }

    if (action === 'show' || action === 'get') {
      if (!firstId) throw new Error('Missing task template key.');

      if (flags.local === true || isLocalTaskTemplateReference(firstId)) {
        render(
          parseLocalTaskTemplateFile(resolveLocalTaskTemplatePath(firstId)),
          {
            group,
            json,
          }
        );
        return;
      }

      render(await client.tasks.getTemplate(workspaceId, firstId), {
        group,
        json,
      });
      return;
    }

    if (action === 'create') {
      const payload = getTaskTemplatePayloadFromFlags(
        flags,
        positionalValue || 'Untitled Template'
      );

      if (flags.local === true || getFlag(flags, 'file')) {
        const file =
          getFlag(flags, 'file') ||
          resolveLocalTaskTemplatePath(
            String(
              getFlag(flags, 'key') || getFlag(flags, 'slug') || payload.name
            )
          );
        const path = writeLocalTaskTemplate(file, payload as never);
        render({ path, template: payload }, { group, json });
        return;
      }

      render(await client.tasks.createTemplate(workspaceId, payload as never), {
        group,
        json,
      });
      return;
    }

    if (action === 'update') {
      if (!firstId) throw new Error('Missing task template key.');
      render(
        await client.tasks.updateTemplate(
          workspaceId,
          firstId,
          getTaskTemplatePayloadFromFlags(flags) as never
        ),
        { group, json }
      );
      return;
    }

    if (action === 'delete' || action === 'archive') {
      if (!firstId) throw new Error('Missing task template key.');
      render(
        await client.tasks.deleteTemplate(workspaceId, firstId, {
          permanent: flags.permanent === true,
        }),
        { group, json }
      );
      return;
    }

    if (action === 'use') {
      if (!firstId) throw new Error('Missing task template key or file.');
      const listSelection = await selectListId(
        client,
        config,
        workspaceId,
        flags,
        json
      );
      config = listSelection.config;

      if (flags.local === true || isLocalTaskTemplateReference(firstId)) {
        render(
          await createTaskFromLocalTemplate({
            client,
            flags,
            listId: listSelection.listId,
            reference: firstId,
            workspaceId,
          }),
          { group: 'tasks', json }
        );
        return;
      }

      render(
        await client.tasks.useTemplate(
          workspaceId,
          firstId,
          getTaskTemplateCreateOverrides(
            flags,
            listSelection.listId,
            getFlag(flags, 'name')
          ) as never
        ),
        { group: 'tasks', json }
      );
      return;
    }

    if (action === 'import') {
      if (!firstId) throw new Error('Missing local task template file.');
      const localTemplate = parseLocalTaskTemplateFile(
        resolveLocalTaskTemplatePath(firstId)
      );
      render(
        await client.tasks.createTemplate(workspaceId, {
          ...localTemplate.payload,
          ...getTaskTemplatePayloadFromFlags(flags),
        } as never),
        { group, json }
      );
      return;
    }

    if (action === 'export') {
      if (!firstId) throw new Error('Missing task template key.');
      const { template } = await client.tasks.getTemplate(workspaceId, firstId);
      const file = getFlag(flags, 'file');
      if (file) {
        const path = writeLocalTaskTemplate(file, template);
        render({ path, template }, { group, json });
        return;
      }

      process.stdout.write(taskTemplateToMarkdown(template));
      return;
    }

    if (action === 'save-from-task') {
      const taskId =
        firstId || getFlag(flags, 'task') || getFlag(flags, 'task-id');
      if (!taskId) throw new Error('Missing task id.');
      render(
        await client.tasks.saveTemplateFromTask(workspaceId, {
          name: getFlag(flags, 'name') || getFlag(flags, 'template-name'),
          taskId,
          visibility: (getFlag(flags, 'visibility') as never) || 'private',
        }),
        { group, json }
      );
      return;
    }
  }

  if (group === 'tasks') {
    if (
      action === 'description' ||
      action === 'descriptions' ||
      action === 'desc'
    ) {
      config = await runTaskDescriptionCommand({
        client,
        config,
        flags,
        json,
        positionals,
        workspaceId,
      });
      return;
    }

    if (action === 'list') {
      const { response: taskResponse, workspaceName } = await listTasksForCli(
        client,
        config,
        workspaceId,
        flags
      );
      render(sortTaskResponseForCli(taskResponse), {
        compact: flags.compact === true,
        currentWorkspaceId: workspaceId,
        group,
        json,
        workspaceName,
      });
      return;
    }
    if (action === 'search') {
      const { response: taskResponse, workspaceName } = await searchTasksForCli(
        client,
        config,
        workspaceId,
        flags,
        positionals
      );
      render(taskResponse, {
        compact: flags.compact === true,
        currentWorkspaceId: workspaceId,
        group,
        json,
        preserveTaskOrder: true,
        showTaskScore: true,
        workspaceName,
      });
      return;
    }
    if (action === 'use' || action === 'select') {
      const selection = await selectTaskId(
        client,
        config,
        workspaceId,
        flags,
        json,
        firstId
      );
      config = selection.config;
      process.stdout.write(`Current task set to ${selection.taskId}\n`);
      return;
    }
    if (action === 'get') {
      const selection = await selectTaskId(
        client,
        config,
        workspaceId,
        flags,
        json,
        firstId
      );
      config = selection.config;
      render(
        withTaskDisplayKey(
          await client.tasks.get(workspaceId, selection.taskId),
          getIdentifierDisplayKey(firstId)
        ),
        {
          group,
          json,
        }
      );
      return;
    }
    if (action === 'create') {
      const listSelection = await selectListId(
        client,
        config,
        workspaceId,
        flags,
        json
      );
      config = listSelection.config;
      const templateReference = getFlag(flags, 'template');
      const descriptionPayload =
        await getTaskDescriptionPayloadFromFlags(flags);
      const chunkDescriptionAfterCreate =
        shouldUseChunkedTaskDescriptionUpdate(descriptionPayload);

      if (templateReference) {
        const createOverrides = {
          ...getTaskTemplateCreateOverrides(
            flags,
            listSelection.listId,
            positionalValue
          ),
          ...(descriptionPayload && !chunkDescriptionAfterCreate
            ? descriptionPayload
            : {}),
        };
        const response =
          flags.local === true ||
          isLocalTaskTemplateReference(templateReference)
            ? await createTaskFromLocalTemplate({
                client,
                flags,
                listId: listSelection.listId,
                reference: templateReference,
                workspaceId,
              })
            : await client.tasks.useTemplate(
                workspaceId,
                templateReference,
                createOverrides as never
              );

        if (
          descriptionPayload &&
          (chunkDescriptionAfterCreate ||
            flags.local === true ||
            isLocalTaskTemplateReference(templateReference))
        ) {
          await updateTaskDescriptionWithBestTransport({
            client,
            payload: descriptionPayload,
            taskId: response.task.id,
            workspaceId,
          });
        }

        render(response, { group, json });
        return;
      }

      const createPayload = {
        assignee_ids: parseCsv(getFlag(flags, 'assignees')),
        end_date: getFlag(flags, 'end-date') || null,
        label_ids: parseCsv(getFlag(flags, 'labels')),
        listId: listSelection.listId,
        name: getFlag(flags, 'name') || positionalValue || 'Untitled Task',
        priority: (getFlag(flags, 'priority') as never) || null,
        project_ids: parseCsv(getFlag(flags, 'projects')),
        start_date: getFlag(flags, 'start-date') || null,
        ...(descriptionPayload && !chunkDescriptionAfterCreate
          ? descriptionPayload
          : {}),
      };
      const response = await client.tasks.create(workspaceId, createPayload);

      if (descriptionPayload && chunkDescriptionAfterCreate) {
        await updateTaskDescriptionWithBestTransport({
          client,
          payload: descriptionPayload,
          taskId: response.task.id,
          workspaceId,
        });
      }

      render(response, { group, json });
      return;
    }
    if (action === 'update') {
      const selection = await selectTaskId(
        client,
        config,
        workspaceId,
        flags,
        json,
        firstId
      );
      config = selection.config;
      const descriptionPayload =
        await getTaskDescriptionPayloadFromFlags(flags);
      const taskUpdatePayload = getTaskUpdatePayload(flags);
      const hasTaskUpdatePayload = Object.keys(taskUpdatePayload).length > 0;
      let response: unknown;

      if (hasTaskUpdatePayload || !descriptionPayload) {
        response = await client.tasks.update(
          workspaceId,
          selection.taskId,
          taskUpdatePayload
        );
      }

      if (descriptionPayload) {
        response = await updateTaskDescriptionWithBestTransport({
          client,
          payload: descriptionPayload,
          taskId: selection.taskId,
          workspaceId,
        });
      }

      await renderTaskMutationResult({
        client,
        displayKey: getIdentifierDisplayKey(firstId),
        fallback: response,
        group,
        json,
        taskId: selection.taskId,
        workspaceId,
      });
      return;
    }
    if (doneActions.has(action || '')) {
      const selection = await selectTaskId(
        client,
        config,
        workspaceId,
        flags,
        json,
        firstId
      );
      config = selection.config;
      const doneListId = await getDefaultStatusListId({
        client,
        config,
        flags,
        json,
        status: 'done',
        taskId: selection.taskId,
        workspaceId,
      });
      const response = await client.tasks.update(
        workspaceId,
        selection.taskId,
        getTaskDonePayload(flags, doneListId)
      );
      await renderTaskMutationResult({
        client,
        displayKey: getIdentifierDisplayKey(firstId),
        fallback: response,
        group,
        json,
        taskId: selection.taskId,
        workspaceId,
      });
      return;
    }
    if (closeActions.has(action || '')) {
      const selection = await selectTaskId(
        client,
        config,
        workspaceId,
        flags,
        json,
        firstId
      );
      config = selection.config;
      const closedListId = await getDefaultStatusListId({
        client,
        config,
        flags,
        json,
        status: 'closed',
        taskId: selection.taskId,
        workspaceId,
      });
      const response = await client.tasks.update(
        workspaceId,
        selection.taskId,
        getTaskClosePayload(flags, closedListId)
      );
      await renderTaskMutationResult({
        client,
        displayKey: getIdentifierDisplayKey(firstId),
        fallback: response,
        group,
        json,
        taskId: selection.taskId,
        workspaceId,
      });
      return;
    }
    if (action === 'delete') {
      const selection = await selectTaskId(
        client,
        config,
        workspaceId,
        flags,
        json,
        firstId
      );
      config = { ...selection.config, currentTaskId: undefined };
      await writeCliConfig(config);
      render(await client.tasks.delete(workspaceId, selection.taskId), {
        group,
        json,
      });
      return;
    }
    if (action === 'move') {
      const taskSelection = await selectTaskId(
        client,
        config,
        workspaceId,
        flags,
        json,
        firstId
      );
      config = taskSelection.config;
      const targetFlags: Record<string, FlagValue> = { ...flags };
      const targetBoardId =
        getFlag(flags, 'target-board') || getFlag(flags, 'board');
      const targetListId = getFlag(flags, 'list');
      if (targetBoardId) {
        targetFlags.board = targetBoardId;
      }
      if (targetListId) {
        targetFlags.list = targetListId;
      }
      const listSelection = await selectListId(
        client,
        config,
        workspaceId,
        targetFlags,
        json
      );
      config = listSelection.config;
      render(
        await client.tasks.move(workspaceId, taskSelection.taskId, {
          list_id: listSelection.listId,
          target_board_id: getFlag(flags, 'target-board'),
        }),
        { group, json }
      );
      return;
    }
    if (action === 'bulk') {
      render(
        await client.tasks.bulk(workspaceId, {
          operation: getPayload(flags) as never,
          taskIds: parseCsv(getFlag(flags, 'ids')),
        }),
        { group, json }
      );
      return;
    }
  }

  if (group === 'labels') {
    if (action === 'list') {
      render(await client.tasks.listLabels(workspaceId), { group, json });
      return;
    }
    if (action === 'use' || action === 'select') {
      const label = firstId
        ? ({ id: firstId } as ListedLabel)
        : await chooseLabel(client, workspaceId, config, json);
      config = { ...config, currentLabelId: label.id };
      await writeCliConfig(config);
      process.stdout.write(`Current label set to ${label.id}\n`);
      return;
    }
    if (action === 'create') {
      render(
        await client.tasks.createLabel(workspaceId, {
          color: normalizeLabelColor(getFlag(flags, 'color')),
          name: getFlag(flags, 'name') || 'Untitled Label',
        }),
        { group, json }
      );
      return;
    }
  }

  if (group === 'projects') {
    if (action === 'list') {
      render(await client.tasks.listProjects(workspaceId), { group, json });
      return;
    }
    if (action === 'use' || action === 'select') {
      const project = firstId
        ? ({ id: firstId } as ListedProject)
        : await chooseProject(client, workspaceId, config, json);
      config = { ...config, currentProjectId: project.id };
      await writeCliConfig(config);
      process.stdout.write(`Current project set to ${project.id}\n`);
      return;
    }
    if (action === 'create') {
      render(
        await client.tasks.createProject(workspaceId, {
          description: getFlag(flags, 'description'),
          name: getFlag(flags, 'name') || 'Untitled Project',
        }),
        { group, json }
      );
      return;
    }
    if (action === 'get') {
      const projectId =
        firstId ||
        config.currentProjectId ||
        (await chooseProject(client, workspaceId, config, json)).id;
      config = { ...config, currentProjectId: projectId };
      await writeCliConfig(config);
      render(await client.tasks.getProject(workspaceId, projectId), {
        group,
        json,
      });
      return;
    }
    if (action === 'tasks') {
      const projectId =
        firstId ||
        config.currentProjectId ||
        (await chooseProject(client, workspaceId, config, json)).id;
      config = { ...config, currentProjectId: projectId };
      await writeCliConfig(config);
      render(await client.tasks.getProjectTasks(workspaceId, projectId), {
        group,
        json,
      });
      return;
    }
  }

  if (group === 'relationships') {
    const taskSelection = await selectTaskId(
      client,
      config,
      workspaceId,
      flags,
      json,
      firstId || getFlag(flags, 'task')
    );
    config = taskSelection.config;
    const taskId = taskSelection.taskId;
    if (action === 'list') {
      render(await client.tasks.getRelationships(workspaceId, taskId), {
        group,
        json,
      });
      return;
    }
    if (action === 'create') {
      render(
        await client.tasks.createRelationship(
          workspaceId,
          taskId,
          getPayload(flags) as never
        ),
        { group, json }
      );
      return;
    }
    if (action === 'delete') {
      render(
        await client.tasks.deleteRelationship(
          workspaceId,
          taskId,
          getPayload(flags) as never
        ),
        { group, json }
      );
      return;
    }
  }

  if (group === 'finance') {
    await runFinanceCommand({
      client,
      flags,
      json,
      positionals,
      workspaceId,
    });
    return;
  }

  throw new Error(
    `Unknown command: ${[group, action].filter(Boolean).join(' ')}`
  );
}
