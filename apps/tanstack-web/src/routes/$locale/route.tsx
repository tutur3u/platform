import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../lib/platform/messages';

/**
 * Locale-scoped layout for every `/$locale/*` route.
 *
 * Provides the i18n message context so SHARED `@tuturuuu/ui` components that
 * call `useTranslations()` (e.g. the tu-do dashboard surface, TaskEditDialog)
 * can render inside apps/tanstack-web WITHOUT being forked to inline strings.
 *
 * Uses `use-intl`'s framework-agnostic `IntlProvider` rather than
 * `next-intl`'s `NextIntlClientProvider`. next-intl is built on use-intl and
 * re-exports the same `useTranslations` hook / `IntlContext`, so the shared
 * components (which import from `next-intl`) read this provider's context — but
 * use-intl carries no Next.js runtime coupling, which is the supported way to
 * run these hooks under TanStack Start (see TanStack Router i18n guide, which
 * lists use-intl as a TanStack Start integration).
 *
 * apps/web supplies messages via next-intl's request config; TanStack Start has
 * no Next request context, so we pass `locale` + `messages` explicitly.
 * `timeZone` is defaulted so relative-time formatting in shared components does
 * not throw; per-page/workspace overrides can be layered later.
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
    <IntlProvider locale={resolvedLocale} messages={messages} timeZone="UTC">
      <Outlet />
    </IntlProvider>
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
    <IntlProvider
      locale={resolvedLocale}
      messages={getMessages(resolvedLocale)}
      timeZone="UTC"
    >
      {children}
    </IntlProvider>
  );
}
