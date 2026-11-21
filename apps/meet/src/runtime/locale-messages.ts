import { createIsomorphicFn } from '@tanstack/react-start';
import type { AbstractIntlMessages } from 'next-intl';
import { use } from 'react';
import enMessagesUrl from '../../messages/en.json?url';
import viMessagesUrl from '../../messages/vi.json?url';
import {
  loadServerLocaleMessages,
  peekServerLocaleMessages,
} from './locale-messages.server';

/**
 * Both message bundles weigh ~940 KB raw; shipping them inside the client
 * bundle delayed every first paint. The server loads the active locale's
 * chunk once per isolate (the page loader warms it before rendering), while
 * the browser fetches only the active locale from the hashed asset URL that
 * `localeMessagesPreload` announces in the document head so the request runs
 * in parallel with the JavaScript download.
 */
type MessagesThenable = Promise<AbstractIntlMessages> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: AbstractIntlMessages;
  reason?: unknown;
};

export function localeMessagesUrl(locale: string) {
  return locale === 'vi' ? viMessagesUrl : enMessagesUrl;
}

export function localeMessagesPreload(locale: string) {
  return {
    rel: 'preload',
    as: 'fetch',
    href: localeMessagesUrl(locale),
    crossOrigin: 'anonymous',
  } as const;
}

const clientCache = new Map<string, MessagesThenable>();
const failures = new Map<string, number>();

/** Fetch attempts per locale before the failure stays until reload. */
export const LOCALE_MESSAGES_MAX_ATTEMPTS = 3;

/**
 * Backoff before a failed locale may be fetched again. Until it elapses the
 * rejected thenable stays cached, so a re-render surfaces the error to the
 * route error boundary instead of starting another request.
 */
export function localeMessagesRetryDelay(failure: number) {
  return 1000 * 2 ** (failure - 1);
}

export function resetLocaleMessagesCache() {
  clientCache.clear();
  failures.clear();
}

export function fetchLocaleMessages(
  locale: string,
  schedule: (run: () => void, ms: number) => unknown = setTimeout
): MessagesThenable {
  const cached = clientCache.get(locale);
  if (cached) return cached;
  const thenable: MessagesThenable = fetch(localeMessagesUrl(locale), {
    credentials: 'same-origin',
  }).then(async (response) => {
    if (!response.ok)
      throw new Error(`Meet messages unavailable (${response.status})`);
    const messages = (await response.json()) as AbstractIntlMessages;
    thenable.status = 'fulfilled';
    thenable.value = messages;
    failures.delete(locale);
    return messages;
  });
  thenable.status = 'pending';
  thenable.catch((reason: unknown) => {
    thenable.status = 'rejected';
    thenable.reason = reason;
    const failure = (failures.get(locale) ?? 0) + 1;
    failures.set(locale, failure);
    if (failure >= LOCALE_MESSAGES_MAX_ATTEMPTS) return;
    schedule(() => {
      if (clientCache.get(locale) === thenable) clientCache.delete(locale);
    }, localeMessagesRetryDelay(failure));
  });
  clientCache.set(locale, thenable);
  return thenable;
}

const readLocaleMessages = createIsomorphicFn()
  .server((locale: string): MessagesThenable => {
    const messages = peekServerLocaleMessages(locale);
    if (!messages) return loadServerLocaleMessages(locale);
    // Already loaded: hand React a settled thenable so SSR does not suspend.
    const thenable: MessagesThenable = Promise.resolve(messages);
    thenable.status = 'fulfilled';
    thenable.value = messages;
    return thenable;
  })
  .client((locale: string): MessagesThenable => fetchLocaleMessages(locale));

/** Suspends until the active locale's messages are available. */
export function useLocaleMessages(locale: string): AbstractIntlMessages {
  const messages: Promise<AbstractIntlMessages> = readLocaleMessages(locale);
  return use(messages);
}
