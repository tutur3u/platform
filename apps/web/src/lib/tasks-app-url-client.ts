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

export function getTasksAppOriginClient() {
  const configured =
    normalizeOrigin(process.env.NEXT_PUBLIC_TASKS_APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_TUDO_APP_URL);

  if (configured) {
    return configured;
  }

  if (typeof window !== 'undefined') {
    const { hostname, port, protocol } = window.location;
    const normalizedHostname = hostname.toLowerCase();

    if (
      normalizedHostname === 'localhost' ||
      normalizedHostname === '127.0.0.1' ||
      normalizedHostname === '::1' ||
      normalizedHostname === '[::1]'
    ) {
      return `${protocol}//${hostname}:7809`;
    }

    if (
      normalizedHostname === 'tuturuuu.localhost' ||
      normalizedHostname.endsWith('.tuturuuu.localhost')
    ) {
      return `${protocol}//tasks.tuturuuu.localhost${port ? `:${port}` : ''}`;
    }

    if (
      normalizedHostname === 'tuturuuu.com' ||
      normalizedHostname.endsWith('.tuturuuu.com')
    ) {
      return 'https://tasks.tuturuuu.com';
    }
  }

  return 'https://tasks.tuturuuu.com';
}

export function getTasksAppUrlClient(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, getTasksAppOriginClient()).toString();
}
