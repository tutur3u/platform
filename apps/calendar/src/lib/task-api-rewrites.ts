const TASK_WORKSPACE_SEGMENTS = [
  'boards',
  'boards-data',
  'boards-with-lists',
  'habit-trackers',
  'habits',
  'labels',
  'notes',
  'task-boards',
  'task-cycles',
  'task-drafts',
  'task-initiatives',
  'task-plans',
  'task-progress',
  'task-projects',
  'task-templates',
  'tasks',
  'templates',
  'time-tracking',
];

export function createTaskApiRewrites(origin: string) {
  const base = origin.replace(/\/+$/, '');
  return [
    ...TASK_WORKSPACE_SEGMENTS.map(
      (segment) => `/api/v1/workspaces/:wsId/${segment}/:path*`
    ),
    '/api/v1/users/me/tasks/:path*',
    '/api/v1/users/me/task-boards/:path*',
    '/api/v1/users/me/workspaces/:wsId/configs/:path*',
    '/api/v1/users/task-settings',
    '/api/v1/task-board-status-templates/:path*',
    '/api/v1/task-projects/resolve-workspace',
    '/api/v1/shared/task-boards/:path*',
    '/api/v1/shared/tasks/:path*',
    '/api/v1/mira/tasks/:path*',
    '/api/:wsId/task/:path*',
  ]
    .flatMap((source) =>
      source.endsWith('/:path*')
        ? [source.replace(/\/:path\*$/u, ''), source]
        : [source]
    )
    .map((source) => ({ source, destination: `${base}${source}` }));
}
