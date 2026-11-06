import { maybeBridgeRequest } from '../core/request-context';
import type { RouteParams } from '../core/route-match';

/**
 * Params of the page the bridge is rendering in this request. Keyed by a
 * global symbol so every environment's copy of this module shares it.
 */
export const PAGE_PARAMS = Symbol.for('tuturuuu.start-bridge.page-params');

export function currentPageParams(): RouteParams {
  const value = maybeBridgeRequest()?.locals.get(PAGE_PARAMS);
  return (value as RouteParams | undefined) ?? {};
}

export function setPageParams(params: RouteParams) {
  const context = maybeBridgeRequest();
  if (!context) return;
  context.locals.set(PAGE_PARAMS, params);
  // `next/root-params` reads the root segment the adapter resolved.
  if (typeof params.locale === 'string')
    context.rootParams = { ...context.rootParams, locale: params.locale };
}

/** Request locale: page param, middleware header, `NEXT_LOCALE`, default. */
export function requestLocale(
  locales: readonly string[] = ['en', 'vi'],
  fallback = 'en'
) {
  const param = currentPageParams().locale;
  if (typeof param === 'string' && locales.includes(param)) return param;
  const request = maybeBridgeRequest()?.request;
  const header = request?.headers.get('x-next-intl-locale');
  if (header && locales.includes(header)) return header;
  const cookie = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/u.exec(
    request?.headers.get('cookie') ?? ''
  )?.[1];
  return cookie && locales.includes(cookie) ? cookie : fallback;
}
