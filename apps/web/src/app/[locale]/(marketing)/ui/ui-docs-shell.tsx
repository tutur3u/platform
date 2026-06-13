'use client';

import type { ReactNode } from 'react';
import { UiDocsMobileNav } from './ui-docs-mobile-nav';
import { UiDocsSidebar } from './ui-docs-sidebar';

export function UiDocsShell({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  return (
    <div className="bg-root-background">
      <UiDocsMobileNav locale={locale} />
      <div className="mx-auto grid w-full max-w-screen-2xl lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden border-r bg-background/50 lg:block">
          <div className="sticky top-20 h-[calc(100dvh-5rem)]">
            <UiDocsSidebar locale={locale} />
          </div>
        </aside>
        <main
          className="min-w-0 px-4 py-8 md:px-8 lg:px-10"
          id="ui-docs-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
