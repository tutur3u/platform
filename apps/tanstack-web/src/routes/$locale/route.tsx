import { createFileRoute, Outlet } from '@tanstack/react-router';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../lib/platform/messages';

/**
 * Locale-scoped layout for every `/$locale/*` route.
 *
 * Provides the next-intl message context so SHARED `@tuturuuu/ui` components
 * that call `useTranslations()` (e.g. the tu-do dashboard surface, TaskEditDialog)
 * can render inside apps/tanstack-web WITHOUT being forked to inline strings.
 *
 * apps/web supplies messages via next-intl's request config; TanStack Start has
 * no Next request context, so we pass `locale` + `messages` explicitly to the
 * client provider. `timeZone` is defaulted so relative-time formatting in shared
 * components does not throw; per-page/workspace overrides can be layered later.
 *
 * Additive on purpose: this is a new layout route, not a change to `__root.tsx`,
 * to minimise overlap with the app-shell lane that owns the root document.
 */
export const Route = createFileRoute('/$locale')({
  component: LocaleLayout,
});

function LocaleLayout() {
  const { locale } = Route.useParams();
  const resolvedLocale = resolveMessagesLocale(locale);
  const messages = getMessages(resolvedLocale);

  return (
    <NextIntlClientProvider
      locale={resolvedLocale}
      messages={messages as Record<string, unknown>}
      timeZone="UTC"
    >
      <Outlet />
    </NextIntlClientProvider>
  );
}

// Re-exported for tests / callers that want the provider wrapper directly.
export function LocaleIntlProvider({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const resolvedLocale = resolveMessagesLocale(locale);
  return (
    <NextIntlClientProvider
      locale={resolvedLocale}
      messages={getMessages(resolvedLocale) as Record<string, unknown>}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}
