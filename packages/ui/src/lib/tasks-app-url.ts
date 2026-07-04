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

function getTasksAppOriginForBrowser() {
  const configured =
    normalizeOrigin(process.env.NEXT_PUBLIC_TASKS_APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_TUDO_APP_URL);

  if (configured) {
    return configured;
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
    return 'https://tasks.tuturuuu.com';
  }

  return null;
}

export function getTasksAppUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getTasksAppOriginForBrowser();

  return origin ? new URL(normalizedPath, origin).toString() : normalizedPath;
}

export function getTaskApiUrl(path: string) {
  return getTasksAppUrl(path);
}
