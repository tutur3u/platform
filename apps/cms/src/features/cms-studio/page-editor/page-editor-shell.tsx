'use client';

import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useId, useState } from 'react';
import type { PageEditorLabels } from './page-editor-labels';
import { ieeai, ieeaiThemeStyle } from './page-editor-theme';

export type PageEditorShellProps = {
  labels: PageEditorLabels;
  /** Title, status, save state and page actions. */
  topBar: ReactNode;
  /** Section outline (left column on wide screens). */
  outline: ReactNode;
  /** The page canvas: the sections being edited. */
  canvas: ReactNode;
  /** Settings for the page or the selected section (right column). */
  inspector?: ReactNode;
  /** Version history, under the inspector. */
  history?: ReactNode;
  className?: string;
};

/** A panel that is always shown on wide screens and toggles on narrow ones. */
function CollapsiblePanel({
  toggleLabel,
  defaultOpen,
  children,
}: {
  toggleLabel: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'flex w-full items-center justify-between rounded-[12px] border border-[var(--ieeai-border)] bg-white px-4 py-3 font-semibold text-[var(--ieeai-navy)] text-sm lg:hidden',
          ieeai.focus
        )}
        onClick={() => setOpen((value) => !value)}
      >
        {toggleLabel}
        <span aria-hidden className="text-[var(--ieeai-subtle)]">
          {open ? '−' : '+'}
        </span>
      </button>
      <div
        id={panelId}
        className={cn(open ? 'block' : 'hidden', 'pt-3 lg:block lg:pt-0')}
      >
        {children}
      </div>
    </>
  );
}

/**
 * Full-page editor layout in IEEAI styling. Wide screens: outline | canvas |
 * inspector. Narrow screens: one column, with the outline and inspector
 * behind toggles. Each panel is mounted once at every width.
 */
export function PageEditorShell({
  labels,
  topBar,
  outline,
  canvas,
  inspector,
  history,
  className,
}: PageEditorShellProps) {
  return (
    <div
      data-ieeai-editor=""
      style={ieeaiThemeStyle}
      className={cn(
        'min-h-[calc(100svh-5rem)] bg-[var(--ieeai-surface)] font-[family-name:var(--ieeai-body)] text-[var(--ieeai-text)]',
        className
      )}
    >
      <div className="sticky top-0 z-20 border-[var(--ieeai-border)] border-b bg-white/95 backdrop-blur">
        {topBar}
      </div>

      <div className="mx-auto grid w-full max-w-[1480px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)_320px] lg:px-8">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <CollapsiblePanel toggleLabel={labels.showOutline} defaultOpen>
            {outline}
          </CollapsiblePanel>
        </aside>

        <main className="min-w-0">
          <div className={cn(ieeai.card, 'p-5 sm:p-8')}>{canvas}</div>
        </main>

        {inspector || history ? (
          <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            {inspector ? (
              <section aria-label={labels.inspectorTitle}>
                <CollapsiblePanel
                  toggleLabel={labels.showInspector}
                  defaultOpen={false}
                >
                  {inspector}
                </CollapsiblePanel>
              </section>
            ) : null}
            {history ? (
              <div className={cn(ieeai.card, 'p-4')}>{history}</div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
