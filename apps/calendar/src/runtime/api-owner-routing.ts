import { createTuturuuuWebWorkspaceApiRewrites } from '@tuturuuu/utils/next-config';
import { createTaskApiRewrites } from '../lib/task-api-rewrites';
import { requestInit } from './request-init';

function matches(source: string, pathname: string) {
  const pattern = source
    .split('/')
    .map((segment) => {
      if (segment === ':path*') return '.*';
      if (segment.startsWith(':')) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${pattern}/?$`, 'u').test(pathname);
}

const tasks = createTaskApiRewrites('https://tasks.invalid');
const web = createTuturuuuWebWorkspaceApiRewrites('https://web.invalid');

export function beforeLocalApiOwner(pathname: string): 'tasks' | 'web' | null {
  if (tasks.some(({ source }) => matches(source, pathname))) return 'tasks';
  if (web.some(({ source }) => matches(source, pathname))) return 'web';
  return null;
}

export function forwardToOwner(request: Request, origin: string) {
  const source = new URL(request.url);
  const destination = new URL(`${source.pathname}${source.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', source.host);
  headers.set('x-forwarded-proto', source.protocol.replace(':', ''));
  return new Request(destination, requestInit(request, headers, 'manual'));
}
