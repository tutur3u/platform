import '@tanstack/react-start/server-only';
import type { AbstractIntlMessages } from 'use-intl';
import { createTranslator } from 'use-intl/core';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { mailRequest } from './request-context';

export async function getLocale() {
  const request = mailRequest().request;
  const segment = new URL(request.url).pathname.split('/')[1];
  if (segment === 'en' || segment === 'vi') return segment;
  return request.headers.get('x-next-intl-locale') === 'vi' ? 'vi' : 'en';
}

export async function getMessages() {
  return (await getLocale()) === 'vi' ? vi : en;
}

export async function getTranslations(
  options?: string | { locale?: string; namespace?: string }
) {
  const locale =
    (typeof options === 'object' ? options.locale : undefined) ??
    (await getLocale());
  const messages: AbstractIntlMessages = locale === 'vi' ? vi : en;
  return createTranslator({
    locale,
    messages,
    namespace: typeof options === 'string' ? options : options?.namespace,
  });
}
