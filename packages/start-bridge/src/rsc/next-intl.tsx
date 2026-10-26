import { type ReactNode, use } from 'react';
import { createFormatter, createTranslator } from 'use-intl/core';
import { IntlClientProvider } from '../intl/client-provider';
import { loadIntlConfig } from '../intl/next-intl-server';

/**
 * `next-intl` inside the RSC environment. Like next-intl's server build, the
 * provider loads the request config and hands locale and messages to the
 * client provider; the hooks read the same per-request config with `use()`.
 */
export async function NextIntlClientProvider({
  children,
  locale,
  messages,
  timeZone,
}: {
  children?: ReactNode;
  locale?: string;
  messages?: Record<string, unknown> | null;
  timeZone?: string;
  [key: string]: unknown;
}) {
  // Settle the hooks' config too, so translated descendants (including
  // Suspense fallbacks) render inline instead of suspending on `use()`.
  const [config] = await Promise.all([
    loadIntlConfig(locale),
    loadIntlConfig(),
  ]);
  return (
    <IntlClientProvider
      locale={config.locale}
      messages={(messages ?? config.messages ?? {}) as never}
      timeZone={timeZone ?? config.timeZone ?? DEFAULT_TIME_ZONE}
    >
      {children}
    </IntlClientProvider>
  );
}

/** next-intl's server default: the runtime's zone (UTC on Workers). */
const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

let warnedUnsettled = false;

function config() {
  const pending = loadIntlConfig();
  if (
    !warnedUnsettled &&
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    (pending as { status?: string }).status !== 'fulfilled'
  ) {
    warnedUnsettled = true;
    console.warn(
      '[start-bridge] A server component used next-intl before NextIntlClientProvider settled the request config. It suspends and streams as a lazy row; keep translated components, especially Suspense fallbacks, below the provider.'
    );
  }
  return use(pending);
}

export function useTranslations(namespace?: string) {
  const { locale, messages, timeZone } = config();
  return createTranslator({
    locale,
    messages: messages ?? {},
    namespace,
    timeZone,
  } as Parameters<typeof createTranslator>[0]);
}
export function useLocale() {
  return config().locale;
}
export function useMessages() {
  return config().messages ?? {};
}
export function useTimeZone() {
  return config().timeZone;
}
export function useNow() {
  return config().now ?? new Date();
}
export function useFormatter() {
  const { locale, timeZone } = config();
  return createFormatter({ locale, timeZone });
}
