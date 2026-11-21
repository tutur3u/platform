/**
 * A small, consistent fake Tuturuuu workspace served by the eval fake API:
 * one workspace, one board, one list and one task, plus the CLI session
 * refresh endpoint. Cases override single routes to model failures.
 */
import {
  BOARD_ID,
  EVAL_BASE_URL,
  EVAL_SECRETS,
  EVAL_TASKS_BASE_URL,
  LIST_ID,
  type RecordedRequest,
  type RouteTable,
  TASK_ID,
  WORKSPACE_ID,
} from './cli-eval-test-fixtures';

const WORKSPACE_TASKS = `${EVAL_TASKS_BASE_URL}/api/v1/workspaces/:wsId/tasks`;

export const routeKeys = {
  boards: `GET ${EVAL_TASKS_BASE_URL}/api/v1/workspaces/:wsId/task-boards`,
  createTask: `POST ${WORKSPACE_TASKS}`,
  defaultWorkspace: `GET ${EVAL_BASE_URL}/api/v1/users/me/default-workspace`,
  getTask: `GET ${WORKSPACE_TASKS}/:taskId`,
  listTasks: `GET ${WORKSPACE_TASKS}`,
  profile: `GET ${EVAL_BASE_URL}/api/v1/users/me/profile`,
  refresh: `POST ${EVAL_BASE_URL}/api/cli/auth/refresh`,
  updateTask: `PUT ${WORKSPACE_TASKS}/:taskId`,
  workspaces: `GET ${EVAL_BASE_URL}/api/v1/workspaces`,
} as const;

export const evalWorkspace = {
  id: WORKSPACE_ID,
  name: 'Eval Workspace',
  personal: false,
};

export function evalTask(overrides: Record<string, unknown> = {}) {
  return {
    assignee_ids: [],
    board_id: BOARD_ID,
    board_name: 'Eval Board',
    created_at: '2026-11-01T00:00:00.000Z',
    display_number: 7,
    end_date: null,
    id: TASK_ID,
    label_ids: [],
    list_id: LIST_ID,
    name: 'Write the eval pyramid',
    priority: 'normal',
    project_ids: [],
    ticket_prefix: 'EVAL',
    ...overrides,
  };
}

export const evalBoard = {
  archived_at: null,
  created_at: '2026-11-01T00:00:00.000Z',
  deleted_at: null,
  icon: null,
  id: BOARD_ID,
  name: 'Eval Board',
  ws_id: WORKSPACE_ID,
};

export function jsonBody(request: RecordedRequest) {
  return request.body
    ? (JSON.parse(request.body) as Record<string, unknown>)
    : {};
}

/** Accepts the original and every rotated refresh token exactly once. */
export function createRefreshRoute() {
  const used = new Set<string>();
  let rotation = 0;
  return {
    count: () => rotation,
    handler: (request: RecordedRequest) => {
      const token = String(jsonBody(request).refreshToken ?? '');
      const valid =
        token === EVAL_SECRETS.refreshToken ||
        token.startsWith(EVAL_SECRETS.rotatedRefreshToken);
      if (!valid || used.has(token)) {
        return Response.json(
          { error: 'Invalid refresh token' },
          { status: 401 }
        );
      }
      used.add(token);
      rotation += 1;
      return {
        session: {
          access_token: `${EVAL_SECRETS.rotatedAccessToken}-${rotation}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_expires_at: Math.floor(Date.now() / 1000) + 86_400,
          refresh_token: `${EVAL_SECRETS.rotatedRefreshToken}-${rotation}`,
          token_type: 'bearer',
        },
      };
    },
  };
}

export function createWorldRoutes(
  overrides: Partial<RouteTable> = {}
): RouteTable {
  const refresh = createRefreshRoute();
  const routes: RouteTable = {
    [routeKeys.profile]: () => ({
      display_name: 'Eval Agent',
      email: 'agent@eval.test',
      id: '00000000-0000-4000-8000-0000000000e1',
    }),
    [routeKeys.defaultWorkspace]: () => evalWorkspace,
    [routeKeys.workspaces]: () => [evalWorkspace],
    [routeKeys.boards]: () => ({ boards: [evalBoard], count: 1 }),
    [routeKeys.listTasks]: (request) =>
      request.url.searchParams.has('identifier')
        ? { tasks: [evalTask()] }
        : { count: 1, tasks: [evalTask()] },
    [routeKeys.getTask]: () => ({ task: evalTask() }),
    [routeKeys.createTask]: (request) => {
      const body = jsonBody(request);
      return { task: evalTask({ list_id: body.listId, name: body.name }) };
    },
    [routeKeys.updateTask]: (request) => ({
      task: evalTask(jsonBody(request)),
    }),
    [routeKeys.refresh]: refresh.handler,
  };
  for (const [key, handler] of Object.entries(overrides)) {
    if (handler) routes[key] = handler;
  }
  return routes;
}
