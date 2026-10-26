import { createIsomorphicFn } from '@tanstack/react-start';
import type { AbstractIntlMessages } from 'next-intl';
import { use } from 'react';
import enMessagesUrl from '../../messages/en.json?url';
import viMessagesUrl from '../../messages/vi.json?url';
import { readServerLocaleMessages } from './locale-messages.server';

/**
 * Both message bundles weigh ~940 KB raw; shipping them inside the client
 * bundle delayed every first paint. The server keeps the static import, while
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

function fetchLocaleMessages(locale: string): MessagesThenable {
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
    return messages;
  });
  thenable.status = 'pending';
  thenable.catch((reason: unknown) => {
    thenable.status = 'rejected';
    thenable.reason = reason;
    clientCache.delete(locale);
  });
  clientCache.set(locale, thenable);
  return thenable;
}

const readLocaleMessages = createIsomorphicFn()
  .server((locale: string): MessagesThenable => {
    const messages = readServerLocaleMessages(locale);
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
