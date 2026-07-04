'use client';

import { type ReactNode, useState } from 'react';
import { UiDocsCommandMenu } from './ui-docs-command-menu';
import { UiDocsMobileNav } from './ui-docs-mobile-nav';
import type { SidebarData } from './ui-docs-nav-data';
import { UiDocsSidebarNav } from './ui-docs-sidebar';

export function UiDocsShell({
  children,
  locale,
  data,
  topbar,
  footer,
}: {
  children: ReactNode;
  locale: string;
  data: SidebarData;
  /** Server-rendered docs navbar, pinned to the top of the right column. */
  topbar: ReactNode;
  /** Server-rendered site footer, stacked below the content. */
  footer: ReactNode;
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  const openCommand = () => setCommandOpen(true);

  return (
    <div className="flex min-h-dvh bg-root-background">
      <aside className="sticky top-0 z-30 hidden h-dvh w-72 shrink-0 border-r bg-background/50 lg:block">
        <UiDocsSidebarNav
          groups={data.groups}
          labels={data.labels}
          locale={locale}
          onOpenCommand={openCommand}
          total={data.total}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <UiDocsMobileNav
          data={data}
          locale={locale}
          onOpenCommand={openCommand}
        />
        <main
          className="min-w-0 flex-1 px-4 py-8 md:px-8 lg:px-10"
          id="ui-docs-content"
        >
          {children}
        </main>
        {footer}
      </div>
      <UiDocsCommandMenu
        groups={data.groups}
        labels={data.labels}
        locale={locale}
        onOpenChange={setCommandOpen}
        open={commandOpen}
      />
    </div>
  );
}
