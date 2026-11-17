'use client';

import { Keyboard } from '@tuturuuu/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Kbd, KbdGroup } from '@tuturuuu/ui/kbd';
import type { NotificationPageLabels } from './notification-page-labels';

function shortcutRows(labels: NotificationPageLabels) {
  return [
    { keys: ['↑', '↓'], alt: ['J', 'K'], text: labels.shortcutMove },
    { keys: ['Enter'], text: labels.shortcutOpen },
    { keys: ['E'], text: labels.shortcutToggle },
    { keys: ['X'], alt: ['Space'], text: labels.shortcutSelect },
    { keys: ['Shift', 'X'], text: labels.shortcutRange },
    { keys: ['Esc'], text: labels.shortcutClear },
    { keys: ['?'], text: labels.shortcutHelp },
  ];
}

const Keys = ({ keys }: { keys: string[] }) => (
  <KbdGroup>
    {keys.map((key) => (
      <Kbd key={key}>{key}</Kbd>
    ))}
  </KbdGroup>
);

/** Compact hint strip under the list; hidden on touch-first widths. */
export function NotificationShortcutHints({
  labels,
  onShowAll,
}: {
  labels: NotificationPageLabels;
  onShowAll: () => void;
}) {
  return (
    <div className="mt-2 hidden flex-wrap items-center justify-center gap-x-4 gap-y-1 text-muted-foreground text-xs md:flex">
      {shortcutRows(labels)
        .slice(0, 4)
        .map((row) => (
          <span key={row.text} className="inline-flex items-center gap-1.5">
            <Keys keys={row.keys} />
            {row.text}
          </span>
        ))}
      <button
        type="button"
        onClick={onShowAll}
        className="inline-flex items-center gap-1.5 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Keyboard aria-hidden className="size-3.5" />
        {labels.shortcuts}
        <Kbd>?</Kbd>
      </button>
    </div>
  );
}

export function NotificationShortcutsDialog({
  labels,
  open,
  onOpenChange,
}: {
  labels: NotificationPageLabels;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{labels.shortcuts}</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
          {shortcutRows(labels).map((row) => (
            <div key={row.text} className="contents">
              <dt className="flex items-center gap-1.5">
                <Keys keys={row.keys} />
                {row.alt && <Keys keys={row.alt} />}
              </dt>
              <dd className="text-muted-foreground">{row.text}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
