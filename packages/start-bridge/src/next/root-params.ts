import { maybeBridgeRequest } from '../server/request-context';

const LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/u;

/**
 * `next/root-params`: the root layout's dynamic params. A page adapter sets
 * them explicitly; otherwise `locale` is read from the request the app sees
 * (the next-intl middleware rewrite `/en/...`, then `x-next-intl-locale`).
 */
export async function getRootParam(name: string): Promise<string | undefined> {
  const context = maybeBridgeRequest();
  if (!context) return undefined;
  const explicit = context.rootParams?.[name];
  if (explicit !== undefined) return explicit;
  if (name !== 'locale') return undefined;
  let pathname = new URL(context.request.url).pathname;
  const base = context.appBase;
  if (base && (pathname === base || pathname.startsWith(`${base}/`)))
    pathname = pathname.slice(base.length) || '/';
  const segment = pathname.split('/')[1];
  if (segment && LOCALE.test(segment)) return segment;
  return context.request.headers.get('x-next-intl-locale') ?? undefined;
}

export async function locale(): Promise<string | undefined> {
  return getRootParam('locale');
}
