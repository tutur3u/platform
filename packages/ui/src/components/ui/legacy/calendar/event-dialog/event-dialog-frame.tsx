'use client';

import {
  Calendar as CalendarIcon,
  ExternalLink,
  Sparkles,
  Video,
  X,
} from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent, ReactNode } from 'react';
import { getCalendarMeetingUrl } from '../calendar-meeting-link';
import {
  CalendarEventProviderIcon,
  getCalendarEventProviderDisplay,
} from '../event-provider-display';
import {
  eventDialogKey,
  isEventDialogSubmitShortcut,
} from './event-dialog-keys';

/**
 * The event dialog surface: a centred dialog on larger screens and a
 * full-screen sheet on phones. Header and footer stay put while the body
 * scrolls, so no field or action is ever clipped. Cmd/Ctrl+Enter saves from
 * anywhere inside; Escape closes (Radix), except while an input method is
 * composing, where it only cancels the candidate.
 */
export function EventDialogContent({
  children,
  onSubmitShortcut,
}: {
  children: ReactNode;
  onSubmitShortcut: () => void;
}) {
  const isMobile = useIsMobile();
  return (
    <DialogContent
      showCloseButton={false}
      presentation={isMobile ? 'fullscreen' : 'default'}
      data-event-dialog=""
      className={cn(
        'flex flex-col gap-0 overflow-hidden',
        // The full-screen sheet keeps its safe-area padding; the dialog drops p-6.
        !isMobile && 'max-h-[min(90dvh,52rem)] p-0 sm:max-w-xl'
      )}
      onEscapeKeyDown={(event) => {
        // Escape first cancels an input method candidate (e.g. Telex).
        if (event.isComposing || event.keyCode === 229) event.preventDefault();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (!isEventDialogSubmitShortcut(eventDialogKey(event))) return;
        event.preventDefault();
        onSubmitShortcut();
      }}
    >
      {children}
    </DialogContent>
  );
}

export function EventDialogHeader({
  event,
  isEditing,
  showModeTabs,
}: {
  event: Partial<CalendarEvent>;
  isEditing: boolean;
  showModeTabs: boolean;
}) {
  const t = useTranslations('calendar.event_dialog');
  const providerDisplay = getCalendarEventProviderDisplay(event);
  const meetingUrl = getCalendarMeetingUrl(event);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 pr-3 pl-4 sm:pl-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <DialogTitle className="truncate font-semibold text-base">
          {isEditing ? t('edit_title') : t('new_title')}
        </DialogTitle>
        {providerDisplay && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 font-medium text-xs">
            <CalendarEventProviderIcon className="size-3.5" event={event} />
            {providerDisplay.label}
          </span>
        )}
      </div>
      <DialogDescription className="sr-only">
        {isEditing ? t('edit_description') : t('new_description')}
      </DialogDescription>
      {meetingUrl && (
        <Button asChild size="sm" variant="outline">
          <a href={meetingUrl} rel="noreferrer" target="_blank">
            <Video className="size-4" />
            Tuturuuu Meet
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      )}
      {showModeTabs && (
        <TabsList aria-label={t('mode_label')} className="h-8">
          <TabsTrigger value="manual" className="px-2.5">
            <CalendarIcon aria-hidden="true" />
            <span className="max-sm:sr-only">{t('tab_quick')}</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="px-2.5">
            <Sparkles aria-hidden="true" />
            <span className="max-sm:sr-only">{t('tab_ai')}</span>
          </TabsTrigger>
        </TabsList>
      )}
      <DialogClose asChild>
        <Button
          aria-label={t('close')}
          className="size-8 shrink-0 text-muted-foreground"
          size="icon"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </DialogClose>
    </div>
  );
}

/** The scrolling middle of the dialog. */
export function EventDialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="event-dialog-body"
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5',
        className
      )}
    >
      {children}
    </div>
  );
}

/** The fixed action row; `start` holds secondary actions on the left. */
export function EventDialogFooter({
  start,
  notice,
  children,
}: {
  start?: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="event-dialog-footer"
      className="shrink-0 border-t bg-background px-4 py-3 sm:px-6"
    >
      {notice}
      <div className="flex items-center gap-2">
        {start}
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

/** A muted icon in the left gutter of a field row. */
export function EventFieldIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 items-center text-muted-foreground [&_svg]:size-4.5"
    >
      {children}
    </span>
  );
}
