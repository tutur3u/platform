type RepositoryMarkdownContext = {
  owner: string;
  refName: string;
  repository: string;
  sourcePath: string;
};

const SAFE_PROTOCOL = /^(https?|ircs?|mailto|xmpp)$/iu;

function sanitizeMarkdownUrl(url: string) {
  const colon = url.indexOf(':');
  const questionMark = url.indexOf('?');
  const numberSign = url.indexOf('#');
  const slash = url.indexOf('/');

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    SAFE_PROTOCOL.test(url.slice(0, colon))
  ) {
    return url;
  }

  return '';
}

function encodePath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function resolveRepositoryPath(url: string, sourcePath: string) {
  const [pathAndQuery, hash = ''] = url.split('#', 2);
  const [pathname = '', query = ''] = pathAndQuery?.split('?', 2) ?? [];
  const sourceDirectory = sourcePath.split('/').slice(0, -1).join('/');
  const base = pathname.startsWith('/') ? '' : sourceDirectory;
  const resolved = new URL(
    [base, pathname].filter(Boolean).join('/'),
    'https://repository.invalid/'
  );

  return {
    hash: hash ? `#${hash}` : '',
    path: resolved.pathname.replace(/^\/+/u, ''),
    query,
  };
}

function isRepositoryRelativeUrl(url: string) {
  return (
    url.startsWith('/') ||
    url.startsWith('./') ||
    url.startsWith('../') ||
    (!url.startsWith('#') &&
      !url.startsWith('?') &&
      !/^[a-z][a-z\d+.-]*:/iu.test(url))
  );
}

export function resolveRepositoryMarkdownLink(
  url: string,
  context?: RepositoryMarkdownContext
) {
  const safeUrl = sanitizeMarkdownUrl(url);
  if (!safeUrl) return '';
  if (!context || !isRepositoryRelativeUrl(safeUrl)) return safeUrl;

  const resolved = resolveRepositoryPath(safeUrl, context.sourcePath);
  if (!resolved.path) return resolved.hash || '/';

  const params = new URLSearchParams(resolved.query);
  params.set('ref', context.refName);
  const view = resolved.path.endsWith('/') ? 'tree' : 'blob';

  return `/${encodeURIComponent(context.owner)}/${encodeURIComponent(
    context.repository
  )}/${view}/${encodePath(resolved.path)}?${params.toString()}${resolved.hash}`;
}

export function resolveRepositoryMarkdownImage(
  url: string,
  context?: RepositoryMarkdownContext
) {
  const safeUrl = sanitizeMarkdownUrl(url);
  if (!safeUrl) return '';
  if (!context || !isRepositoryRelativeUrl(safeUrl)) return safeUrl;

  const resolved = resolveRepositoryPath(safeUrl, context.sourcePath);
  if (!resolved.path) return safeUrl;

  return `https://raw.githubusercontent.com/${encodeURIComponent(
    context.owner
  )}/${encodeURIComponent(context.repository)}/${encodeURIComponent(
    context.refName
  )}/${encodePath(resolved.path)}${resolved.query ? `?${resolved.query}` : ''}${
    resolved.hash
  }`;
}

export type { RepositoryMarkdownContext };
