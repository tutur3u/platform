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
}: {
  children: ReactNode;
  locale: string;
  data: SidebarData;
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  const openCommand = () => setCommandOpen(true);

  return (
    <div className="bg-root-background">
      <UiDocsMobileNav
        data={data}
        locale={locale}
        onOpenCommand={openCommand}
      />
      <div className="mx-auto grid w-full max-w-screen-2xl lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden border-r bg-background/50 lg:block">
          <div className="sticky top-20 h-[calc(100dvh-5rem)]">
            <UiDocsSidebarNav
              groups={data.groups}
              labels={data.labels}
              locale={locale}
              onOpenCommand={openCommand}
              total={data.total}
            />
          </div>
        </aside>
        <main
          className="min-w-0 px-4 py-8 md:px-8 lg:px-10"
          id="ui-docs-content"
        >
          {children}
        </main>
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
