import { spawn } from 'node:child_process';
import type {
  ListWorkspaceTasksOptions,
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
import {
  type CliConfig,
  DEFAULT_BASE_URL,
  getDefaultConfigPath,
  normalizeBaseUrl,
  readCliConfig,
  writeCliConfig,
} from './config';
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
import { checkForCliUpdate, isCliUpdateCheckDisabled } from './update';

const doneActions = new Set(['complete', 'completed', 'done', 'mark-done']);
const closeActions = new Set(['archive', 'close', 'closed', 'mark-closed']);
const DEFAULT_TASK_PAGE_SIZE = 50;
const ACTIVE_TASK_LIST_STATUSES = ['not_started', 'active'] as const;
const DOCUMENT_TASK_LIST_STATUSES = ['documents'] as const;
const REVIEW_TASK_LIST_STATUSES = ['review'] as const;
const DONE_TASK_LIST_STATUSES = ['review', 'done'] as const;
const CLOSED_TASK_LIST_STATUSES = ['closed'] as const;

type ListedWorkspace = Awaited<
  ReturnType<TuturuuuUserClient['workspaces']['list']>
>[number];
type CliTask = WorkspaceTaskApiTask & {
  workspace_id?: string | null;
  workspace_name?: string | null;
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

function hasTaskListScope(config: CliConfig, flags: Record<string, FlagValue>) {
  return Boolean(
    getFlag(flags, 'board') ||
      getFlag(flags, 'board-id') ||
      getFlag(flags, 'list') ||
      getFlag(flags, 'list-id') ||
      config.currentBoardId ||
      config.currentListId
  );
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

function getCliTaskListStatuses(
  config: CliConfig,
  flags: Record<string, FlagValue>
) {
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
    (getFlag(flags, 'list') ||
      getFlag(flags, 'list-id') ||
      config.currentListId) &&
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
  config: CliConfig,
  flags: Record<string, FlagValue>
): ListWorkspaceTasksOptions {
  const pagination = getTaskPagination(flags);
  const listStatuses = getCliTaskListStatuses(config, flags);
  const activeStatusesOnly =
    listStatuses?.length === ACTIVE_TASK_LIST_STATUSES.length &&
    ACTIVE_TASK_LIST_STATUSES.every((status) => listStatuses.includes(status));

  return {
    boardId:
      getFlag(flags, 'board') ||
      getFlag(flags, 'board-id') ||
      config.currentBoardId,
    ...getCliTaskStateFilters(flags),
    forTimeTracking:
      activeStatusesOnly &&
      !(
        getFlag(flags, 'list') ||
        getFlag(flags, 'list-id') ||
        config.currentListId
      ),
    includeCount: flags.count === true,
    includeDeleted: flags.deleted === true,
    limit: pagination.limit,
    listId:
      getFlag(flags, 'list') ||
      getFlag(flags, 'list-id') ||
      config.currentListId,
    offset: pagination.offset,
    q: getFlag(flags, 'q'),
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
  config: CliConfig,
  flags: Record<string, FlagValue>
) {
  if (!workspace?.personal) return false;
  if (getFlag(flags, 'workspace') || getFlag(flags, 'ws')) return false;
  return !hasTaskListScope(config, flags);
}

export async function listTasksForCli(
  client: TuturuuuUserClient,
  config: CliConfig,
  workspaceId: string,
  flags: Record<string, FlagValue>
): Promise<{ response: WorkspaceTasksResponse; workspaceName?: string }> {
  const options = getCliTaskListOptions(config, flags);
  const workspaces = await client.workspaces.list();
  const currentWorkspace = resolveWorkspace(workspaceId, workspaces);
  const workspaceName = currentWorkspace?.name || workspaceId;
  const fallbackWorkspace = {
    id: workspaceId,
    name: workspaceName,
  } as ListedWorkspace;
  const shouldIncludeExternalTasks = shouldIncludeAssignedExternalTasks(
    currentWorkspace,
    config,
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
  const baseResponse = await client.tasks.list(workspaceId, fetchOptions);
  const listStatuses = getCliTaskListStatuses(config, flags);
  const filteredBaseTasks = filterTasksByListStatuses(
    baseResponse.tasks,
    listStatuses
  );

  if (!shouldIncludeExternalTasks || !currentWorkspace) {
    return {
      response: {
        ...baseResponse,
        tasks: filteredBaseTasks.map((task) =>
          annotateTaskWorkspace(task, currentWorkspace ?? fallbackWorkspace)
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
  const count =
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
    response: {
      ...baseResponse,
      tasks,
      ...(typeof count === 'number' ? { count } : {}),
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
  config.baseUrl = normalizeBaseUrl(
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

export async function runCli(argv = process.argv.slice(2)) {
  if (argv.length === 1 && (argv[0] === '-v' || argv[0] === '--version')) {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  const { flags, positionals } = parseArgs(argv);
  const [group, rawAction, rawFirstId] = positionals;
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
    await writeCliConfig({ ...config, baseUrl: normalizeBaseUrl(firstId) });
    process.stdout.write(`Base URL set to ${normalizeBaseUrl(firstId)}\n`);
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

  if (group === 'tasks') {
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
      render(
        await client.tasks.create(workspaceId, {
          assignee_ids: parseCsv(getFlag(flags, 'assignees')),
          end_date: getFlag(flags, 'end-date') || null,
          label_ids: parseCsv(getFlag(flags, 'labels')),
          listId: listSelection.listId,
          name: getFlag(flags, 'name') || positionalValue || 'Untitled Task',
          priority: (getFlag(flags, 'priority') as never) || null,
          project_ids: parseCsv(getFlag(flags, 'projects')),
          start_date: getFlag(flags, 'start-date') || null,
        }),
        { group, json }
      );
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
      const response = await client.tasks.update(
        workspaceId,
        selection.taskId,
        getTaskUpdatePayload(flags)
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
          color: getFlag(flags, 'color') || 'gray',
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

  throw new Error(
    `Unknown command: ${[group, action].filter(Boolean).join(' ')}`
  );
}
