import {
  getAppProductionBaseUrl,
  joinAppUrl,
  parseActiveAppMounts,
} from '@tuturuuu/utils/app-mounts';

/** Global the start-bridge head script sets to the document's app base. */
const APP_BASE_GLOBAL = '__tuturuuuAppBase';
const TASKS_BASE_PATH = '/tasks';

/** The app base of the current document (`/tasks` when Tasks is mounted). */
function documentAppBase(): string {
  const value = (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL];
  return typeof value === 'string' ? value : '';
}

function normalizeOrigin(value?: string) {
  if (!value) {
    return null;
  }

  const [firstValue] = value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!firstValue) {
    return null;
  }

  const normalized = /^[a-z]+:\/\//iu.test(firstValue)
    ? firstValue
    : `https://${firstValue}`;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

/** Inside mounted Tasks (`tuturuuu.com/tasks`), where Tasks is same-origin. */
function isInsideMountedTasks() {
  return (
    typeof window !== 'undefined' &&
    window.location.hostname.toLowerCase() === 'tuturuuu.com' &&
    documentAppBase() === TASKS_BASE_PATH
  );
}

function getTasksAppOriginForBrowser() {
  if (isInsideMountedTasks()) return TASKS_BASE_PATH;

  const configured =
    normalizeOrigin(process.env.NEXT_PUBLIC_TASKS_APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_TUDO_APP_URL);

  if (configured) {
    // https://tuturuuu.com/tasks once the mount is active; unchanged otherwise.
    return getAppProductionBaseUrl('tasks', configured, parseActiveAppMounts());
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const { hostname, port, protocol } = window.location;
  const normalizedHostname = hostname.toLowerCase();

  if (
    normalizedHostname === 'tasks.tuturuuu.com' ||
    normalizedHostname === 'tasks.tuturuuu.localhost' ||
    port === '7809'
  ) {
    return null;
  }

  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]'
  ) {
    return port ? `${protocol}//${hostname}:7809` : null;
  }

  if (
    normalizedHostname === 'tuturuuu.localhost' ||
    normalizedHostname.endsWith('.tuturuuu.localhost')
  ) {
    return `${protocol}//tasks.tuturuuu.localhost`;
  }

  if (
    normalizedHostname === 'tuturuuu.com' ||
    normalizedHostname.endsWith('.tuturuuu.com')
  ) {
    // Web and sibling apps (Web, sibling apps): Tasks' production base, which is
    // https://tuturuuu.com/tasks once the mount is active.
    return getAppProductionBaseUrl(
      'tasks',
      'https://tasks.tuturuuu.com',
      parseActiveAppMounts()
    );
  }

  return null;
}

export function getTasksAppUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getTasksAppOriginForBrowser();

  if (!base) return normalizedPath;
  // A same-origin mount base (`/tasks`) or an absolute origin/base URL.
  return joinAppUrl(base, normalizedPath);
}

export function getTaskApiUrl(path: string) {
  if (
    typeof window !== 'undefined' &&
    ['calendar.tuturuuu.com', 'calendar.tuturuuu.localhost'].includes(
      window.location.hostname.toLowerCase()
    )
  ) {
    return path.startsWith('/') ? path : `/${path}`;
  }
  return getTasksAppUrl(path);
}
