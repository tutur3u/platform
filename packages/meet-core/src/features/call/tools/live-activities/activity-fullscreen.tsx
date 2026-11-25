'use client';

import { Maximize2, Minimize2 } from '@tuturuuu/icons';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useActivityModalOpen,
  useActivityPane,
} from '../../stage-layout/activity-pane-context';
import { useMeetCallUx } from '../../prejoin/use-meet-call-ux';
import { ToolAction, ToolIconAction } from '../tool-ui';

/**
 * A live activity filling the screen. The dialog keeps focus inside, Escape
 * and the exit action leave it, and its edges clear the device's safe areas.
 * The optional aside becomes a right rail on wide screens and is left out on
 * narrow ones, where the main content already has the whole width.
 */
export function ActivityFullscreen({
  open,
  onOpenChange,
  title,
  meta,
  actions,
  aside,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Short status beside the title, such as a live chip and counts. */
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('meet.call.live_activities');
  const meetUxV2 = useMeetCallUx();
  const pane = useActivityPane();
  const modalOpen = useActivityModalOpen(open);
  // Keep the fullscreen body's local draft in a stable portal host while
  // closing the modal so a share can use the stage and receive focus.
  const [host] = useState(() =>
    meetUxV2 && pane && typeof document !== 'undefined'
      ? document.createElement('div')
      : null
  );
  const attach = useCallback(
    (container: HTMLDivElement | null) => {
      if (container && host) {
        host.className = 'flex min-h-0 flex-1 flex-col';
        container.append(host);
      }
    },
    [host]
  );

  return (
    <>
      {host && createPortal(children, host)}
      <Dialog open={modalOpen} onOpenChange={onOpenChange}>
        <DialogContent
          presentation="fullscreen"
          showCloseButton={false}
          aria-describedby={undefined}
          className="flex-col"
        >
          <header className="flex min-h-14 items-center gap-3 border-b px-4 py-2 md:px-6">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <DialogTitle className="truncate font-semibold text-base">
                {title}
              </DialogTitle>
              {meta}
            </div>
            {actions}
            <ToolAction
              icon={Minimize2}
              label={t('exit_fullscreen')}
              variant="ghost"
              className="pointer-coarse:h-11"
              onClick={() => onOpenChange(false)}
            />
          </header>
          <div className="flex min-h-0 flex-1">
            <div
              ref={host ? attach : undefined}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              {host ? null : children}
            </div>
            {aside ? (
              <aside className="hidden w-96 shrink-0 overflow-y-auto border-l bg-muted/30 p-6 lg:block">
                {aside}
              </aside>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The header action that opens an activity in full screen. */
export function ActivityFullscreenButton({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('meet.call.live_activities');
  return (
    <ToolIconAction icon={Maximize2} label={t('fullscreen')} onClick={onOpen} />
  );
}
