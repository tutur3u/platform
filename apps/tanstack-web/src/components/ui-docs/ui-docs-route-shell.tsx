import type { ReactNode } from 'react';
import { resolveUiDocsLocale } from '../../data/ui-docs/messages';
import { UiDocsI18nProvider } from './ui-docs-i18n';
import { buildSidebarData } from './ui-docs-nav-data';
import { UiDocsShell } from './ui-docs-shell';
import { UiDocsTopbar } from './ui-docs-topbar';
import './shiki.css';

export function UiDocsRouteShell({
  children,
  locale,
}: {
  children: ReactNode;
  locale: unknown;
}) {
  const normalizedLocale = resolveUiDocsLocale(locale);
  const data = buildSidebarData(normalizedLocale);

  return (
    <UiDocsI18nProvider locale={normalizedLocale}>
      <UiDocsShell
        data={data}
        footer={<UiDocsFooter />}
        locale={normalizedLocale}
        topbar={<UiDocsTopbar locale={normalizedLocale} />}
      >
        {children}
      </UiDocsShell>
    </UiDocsI18nProvider>
  );
}

function UiDocsFooter() {
  return (
    <footer className="border-t px-4 py-8 text-muted-foreground text-sm md:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        Tuturuuu UI showcases shared components, usage guidance, and
        contribution patterns.
      </div>
    </footer>
  );
}
