'use client';

import { type ReactNode, useState } from 'react';
import { designFrameClass } from './design-frame';
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
  frame = 'standalone',
}: {
  children: ReactNode;
  locale: string;
  data: SidebarData;
  /** Server-rendered docs navbar. Omitted when the marketing shell already supplies it. */
  topbar?: ReactNode;
  /** Server-rendered site footer. Omitted when the marketing layout already supplies it. */
  footer?: ReactNode;
  /**
   * `marketing` sits under the shared homepage shell. `standalone` is the
   * legacy full-viewport docs frame.
   */
  frame?: 'marketing' | 'standalone';
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  const openCommand = () => setCommandOpen(true);
  const marketing = frame === 'marketing';

  return (
    <div
      className={
        marketing ? designFrameClass.root : 'flex min-h-dvh bg-root-background'
      }
    >
      <aside
        className={
          marketing
            ? designFrameClass.aside
            : 'sticky top-0 z-30 hidden h-dvh w-72 shrink-0 border-r bg-background/50 lg:block'
        }
      >
        <UiDocsSidebarNav
          groups={data.groups}
          labels={data.labels}
          locale={locale}
          onOpenCommand={openCommand}
          total={data.total}
        />
      </aside>
      <div
        className={
          marketing ? designFrameClass.column : 'flex min-w-0 flex-1 flex-col'
        }
      >
        {topbar}
        <UiDocsMobileNav
          data={data}
          locale={locale}
          onOpenCommand={openCommand}
          placement={marketing ? 'below-header' : 'viewport'}
        />
        <main
          className={
            marketing
              ? designFrameClass.main
              : 'min-w-0 flex-1 px-4 py-8 md:px-8 lg:px-10'
          }
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
