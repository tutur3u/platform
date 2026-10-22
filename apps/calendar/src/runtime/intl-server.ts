import '@tanstack/react-start/server-only';
import {
  createTranslator,
  type NamespaceKeys,
  type NestedKeyOf,
} from 'use-intl/core';
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

type Namespace = NamespaceKeys<typeof en, NestedKeyOf<typeof en>>;
export async function getTranslations<N extends Namespace = never>(
  options?: N | { locale?: string; namespace?: N }
) {
  const locale =
    (typeof options === 'object' ? options.locale : undefined) ??
    (await getLocale());
  const messages = locale === 'vi' ? vi : en;
  return createTranslator({
    locale,
    messages,
    namespace: typeof options === 'string' ? options : options?.namespace,
  });
}
