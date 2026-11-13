import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context/core';
import {
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_PATHS,
} from '@/i18n/client-messages';

const PATHNAME = Symbol.for('tuturuuu.marketing.render-pathname');

/** The resolved document location, including client navigations through a server function. */
export function setMarketingRenderPath(href: string) {
  maybeBridgeRequest()?.locals.set(
    PATHNAME,
    new URL(href, 'http://marketing.local').pathname
  );
}

export function marketingMessagePaths(pathname: string | undefined) {
  return [
    ...ROOT_CLIENT_MESSAGE_PATHS,
    ...(['/', '/en', '/vi'].includes(pathname ?? '')
      ? ['landing', 'commercialComparison']
      : MARKETING_CLIENT_MESSAGE_NAMESPACES),
  ];
}

export function getMarketingMessagePaths() {
  return marketingMessagePaths(
    maybeBridgeRequest()?.locals.get(PATHNAME) as string | undefined
  );
}
