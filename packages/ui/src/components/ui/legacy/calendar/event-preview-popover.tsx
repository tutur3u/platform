'use client';

import { Edit3, Lock, MapPin, Trash2, X } from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { Popover, PopoverAnchor, PopoverContent } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { calendarEventStyle } from '@tuturuuu/utils/calendar-event-colors';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import { useEventPreviewAnchor } from './event-preview-anchor';
import { useDeferredEventDelete } from './event-preview-deferred-delete';
import { formatEventPreviewTime } from './event-preview-time';
import {
  CalendarEventProviderIcon,
  getCalendarEventProviderDisplay,
} from './event-provider-display';

function getCalendarName(event: CalendarEvent) {
  if (event._calendarName) return event._calendarName;
  const providerDisplay = getCalendarEventProviderDisplay(event);
  if (!providerDisplay) return 'Tuturuuu';
  return (
    event.google_calendar_id ||
    event.external_calendar_id ||
    providerDisplay.label
  );
}

export function EventPreviewPopover() {
  const t = useTranslations('calendar.event_preview');
  const preferences = useCalendarPreferences();
  const locale = useLocale();
  const {
    previewEvent,
    isPreviewOpen,
    closePreview,
    openEventEditor,
    readOnly,
    isEventReadOnly,
  } = useCalendar();
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  // Focus returns to the event only when the preview is dismissed in place
  // (Escape or Close), not when another surface takes over.
  const returnFocus = useRef(true);
  const eventId = isPreviewOpen ? previewEvent?.id : undefined;
  const { anchor, resolved } = useEventPreviewAnchor(eventId);
  const scheduleDelete = useDeferredEventDelete({
    deleted: t('deleted'),
    undo: t('undo'),
    failed: t('delete_failed'),
  });

  if (!previewEvent || !eventId || !resolved) return null;

  const canDelete = !readOnly && !isEventReadOnly(previewEvent);
  const calendarName = getCalendarName(previewEvent);
  const providerDisplay = getCalendarEventProviderDisplay(previewEvent);
  const showProviderIcon =
    !!providerDisplay && providerDisplay.label !== calendarName;
  const time = formatEventPreviewTime(
    previewEvent.start_at,
    previewEvent.end_at,
    preferences,
    locale
  );

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) closePreview();
      }}
    >
      {anchor ? (
        <PopoverAnchor virtualRef={anchor.virtualRef} />
      ) : (
        <PopoverAnchor asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed top-20 right-4 size-0"
          />
        </PopoverAnchor>
      )}
      <PopoverContent
        ref={contentRef}
        role="dialog"
        aria-labelledby={titleId}
        side={anchor?.side ?? 'bottom'}
        align={anchor ? 'start' : 'end'}
        sideOffset={8}
        collisionPadding={16}
        tabIndex={-1}
        className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3"
        data-testid="event-preview"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current = true;
          contentRef.current?.focus();
        }}
        onInteractOutside={() => {
          returnFocus.current = false;
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocus.current || !anchor?.element.isConnected) return;
          event.preventDefault();
          anchor.element.focus();
        }}
      >
        <div className="flex items-start gap-2">
          <h3
            id={titleId}
            className="min-w-0 flex-1 break-words pt-1 font-semibold text-sm"
          >
            {previewEvent.title || t('untitled')}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={t('close')}
            onClick={closePreview}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
          {time && <span>{time}</span>}
          {time && <span aria-hidden>·</span>}
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              data-testid="event-preview-swatch"
              className="size-3 shrink-0 rounded-sm"
              style={calendarEventStyle(previewEvent)}
            />
            <span className="truncate">{calendarName}</span>
            {showProviderIcon && (
              <CalendarEventProviderIcon
                event={previewEvent}
                className="size-3.5"
              />
            )}
          </span>
          {readOnly && (
            <>
              <span aria-hidden>·</span>
              <span>{t('read_only')}</span>
            </>
          )}
          {!readOnly && previewEvent.locked && (
            <Lock className="size-3.5" aria-label={t('locked')} role="img" />
          )}
        </div>

        {previewEvent.location && (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{previewEvent.location}</span>
          </p>
        )}
        {previewEvent.description && (
          <p className="line-clamp-3 whitespace-pre-line text-sm">
            {previewEvent.description}
          </p>
        )}

        <div className="flex items-center justify-end gap-1 pt-1">
          {canDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  aria-label={t('delete')}
                  onClick={() => {
                    returnFocus.current = false;
                    closePreview();
                    scheduleDelete(previewEvent);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('delete')}</TooltipContent>
            </Tooltip>
          )}
          <Button
            type="button"
            size="xs"
            onClick={() => {
              returnFocus.current = false;
              openEventEditor(previewEvent.id);
              closePreview();
            }}
          >
            <Edit3 className="size-4" />
            {t('edit')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
