import type { AbstractIntlMessages } from 'use-intl';
import { createTranslator } from 'use-intl/core';
import { bridgeRequest } from '../server/request-context';

export type BridgeLocale = 'en' | 'vi';

/**
 * `next-intl/server` for one app's message bundles. The locale is the first
 * app-relative path segment, then the `x-next-intl-locale` header set by the
 * app's middleware, then English. Import from a server-only module.
 */
export function createIntlServer(
  // JSON message bundles import as plain records; `en` is the fallback.
  messages: Record<string, unknown>,
  options: { basePath?: string } = {}
) {
  const bundle = (locale: string) =>
    (messages[locale] ?? messages.en ?? {}) as AbstractIntlMessages;
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
    return bundle(locale);
  }
  async function getTranslations(
    input?: string | { locale?: string; namespace?: string }
  ) {
    const locale =
      (typeof input === 'object' ? input.locale : undefined) ??
      (await getLocale());
    return createTranslator({
      locale,
      messages: bundle(locale),
      namespace: typeof input === 'string' ? input : input?.namespace,
    });
  }
  return { getLocale, getMessages, getTranslations };
}
