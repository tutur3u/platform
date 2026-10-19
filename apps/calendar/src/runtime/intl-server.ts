import '@tanstack/react-start/server-only';
import type { AbstractIntlMessages } from 'use-intl';
import { createTranslator } from 'use-intl/core';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { calendarRequest } from './request-context';
import { resolveCalendarLocale } from './request-locale';

export async function getLocale() {
  return resolveCalendarLocale(calendarRequest().request);
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
