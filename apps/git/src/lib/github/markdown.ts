import { defaultUrlTransform } from 'react-markdown';

type RepositoryMarkdownContext = {
  owner: string;
  refName: string;
  repository: string;
  sourcePath: string;
};

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
  const safeUrl = defaultUrlTransform(url);
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
  const safeUrl = defaultUrlTransform(url);
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
