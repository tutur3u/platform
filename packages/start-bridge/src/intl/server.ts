import type { AbstractIntlMessages } from 'use-intl';
import { createTranslator } from 'use-intl/core';
import { bridgeRequest } from '../core/request-context';

export type BridgeLocale = 'en' | 'vi';

/**
 * `next-intl/server` for one app's message bundles. The locale is the first
 * app-relative path segment, then the `x-next-intl-locale` header set by the
 * app's middleware, then English. Import from a server-only module.
 */
export function createIntlServer(
  messages: Record<BridgeLocale, AbstractIntlMessages>,
  options: { basePath?: string } = {}
) {
  async function getLocale(): Promise<BridgeLocale> {
    const request = bridgeRequest().request;
    let pathname = new URL(request.url).pathname;
    if (options.basePath && pathname.startsWith(`${options.basePath}/`))
      pathname = pathname.slice(options.basePath.length);
    const segment = pathname.split('/')[1];
    if (segment === 'en' || segment === 'vi') return segment;
    return request.headers.get('x-next-intl-locale') === 'vi' ? 'vi' : 'en';
  }
  async function getMessages(input?: { locale?: string }) {
    const locale = input?.locale ?? (await getLocale());
    return locale === 'vi' ? messages.vi : messages.en;
  }
  async function getTranslations(
    input?: string | { locale?: string; namespace?: string }
  ) {
    const locale =
      (typeof input === 'object' ? input.locale : undefined) ??
      (await getLocale());
    return createTranslator({
      locale,
      messages: locale === 'vi' ? messages.vi : messages.en,
      namespace: typeof input === 'string' ? input : input?.namespace,
    });
  }
  return { getLocale, getMessages, getTranslations };
}
