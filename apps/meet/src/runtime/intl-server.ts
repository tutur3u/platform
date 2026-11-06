import '@tanstack/react-start/server-only';
import type { AbstractIntlMessages } from 'use-intl';
import { createTranslator } from 'use-intl/core';
import { loadServerLocaleMessages } from './locale-messages.server';
import { meetRequest } from './request-context';

export async function getLocale() {
  const request = meetRequest().request;
  const segment = new URL(request.url).pathname.split('/')[1];
  if (segment === 'en' || segment === 'vi') return segment;
  return request.headers.get('x-next-intl-locale') === 'vi' ? 'vi' : 'en';
}

export async function getMessages() {
  return loadServerLocaleMessages(await getLocale());
}

export async function getTranslations(
  options?: string | { locale?: string; namespace?: string }
) {
  const locale =
    (typeof options === 'object' ? options.locale : undefined) ??
    (await getLocale());
  const messages: AbstractIntlMessages = await loadServerLocaleMessages(locale);
  return createTranslator({
    locale,
    messages,
    namespace: typeof options === 'string' ? options : options?.namespace,
  });
}
