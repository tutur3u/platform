'use client';

import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useState } from 'react';
import { ResetIcon } from './icons';
import { panel } from './styles';

/**
 * Frame for one interactive demo. Reset stays in the toolbar at every width
 * and announces itself, so people can always return to the sample data.
 */
export function DemoPanel({
  label,
  onReset,
  children,
}: {
  /** Accessible name for the demo region, e.g. "Tasks demo". */
  label: string;
  onReset: () => void;
  children: ReactNode;
}) {
  const [announcement, setAnnouncement] = useState('');

  return (
    <section aria-label={label} className={cn(panel, 'overflow-hidden')}>
      <div className="flex items-center justify-between gap-3 border-border border-b bg-muted/40 px-4 py-2.5 md:px-5">
        <p className="text-muted-foreground text-xs sm:text-sm">
          Sample data. Changes stay in this tab.
        </p>
        <Button
          onClick={() => {
            onReset();
            // Alternate a trailing space so repeated resets are re-announced.
            setAnnouncement((current) =>
              current.endsWith(' ')
                ? `${label} reset to sample data.`
                : `${label} reset to sample data. `
            );
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <ResetIcon />
          Reset
        </Button>
      </div>
      <div className="p-4 md:p-5">{children}</div>
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
    </section>
  );
}

/** Inline validation or limit message tied to a control by id. */
export function FieldMessage({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p className="text-destructive text-sm" id={id}>
      {children}
    </p>
  );
}
