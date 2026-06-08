'use client';

import {
  Calendar,
  Clock,
  Edit3,
  ExternalLink,
  Lock,
  MapPin,
  Trash2,
  X,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useEffect, useRef } from 'react';

function formatEventTime(startAt?: string, endAt?: string) {
  if (!startAt || !endAt) return '';

  const start = new Date(startAt);
  const end = new Date(endAt);
  const sameDay = start.toDateString() === end.toDateString();

  if (sameDay) {
    return `${format(start, 'EEE, MMM d')} - ${format(start, 'p')} - ${format(end, 'p')}`;
  }

  return `${format(start, 'MMM d, p')} - ${format(end, 'MMM d, p')}`;
}

function getSourceLabel(event: {
  provider?: string | null;
  google_calendar_id?: string | null;
  external_calendar_id?: string | null;
  _calendarName?: string;
}) {
  if (event._calendarName) return event._calendarName;
  if (event.provider === 'google') {
    return event.google_calendar_id || event.external_calendar_id || 'Google';
  }
  if (event.provider === 'microsoft') {
    return event.external_calendar_id || 'Microsoft';
  }
  return 'Tuturuuu';
}

export function EventPreviewPopover() {
  const {
    previewEvent,
    isPreviewOpen,
    closePreview,
    openEventEditor,
    deleteEvent,
    readOnly,
  } = useCalendar();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPreviewOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        popoverRef.current &&
        event.target instanceof Node &&
        !popoverRef.current.contains(event.target)
      ) {
        closePreview();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePreview, isPreviewOpen]);

  if (!isPreviewOpen || !previewEvent) return null;

  const provider = previewEvent.provider || 'tuturuuu';
  const isSynced = provider === 'google' || provider === 'microsoft';
  const sourceLabel = getSourceLabel(previewEvent);

  return (
    <div
      ref={popoverRef}
      className={cn(
        'fixed top-20 right-4 z-50 w-[min(380px,calc(100vw-2rem))]',
        'rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl'
      )}
      role="dialog"
      aria-label="Event quick preview"
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: previewEvent._calendarColor || undefined }}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-base">
                {previewEvent.title || 'Untitled event'}
              </h3>
              <p className="text-muted-foreground text-sm">
                {formatEventTime(previewEvent.start_at, previewEvent.end_at)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={closePreview}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="truncate">{sourceLabel}</span>
              <Badge variant="secondary" className="ml-auto capitalize">
                {provider}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {isSynced ? 'Synced with provider' : 'Local calendar'}
              </span>
            </div>
            {previewEvent.locked && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="h-4 w-4" />
                <span>Locked from auto scheduling</span>
              </div>
            )}
            {previewEvent.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="truncate">{previewEvent.location}</span>
              </div>
            )}
          </div>

          {previewEvent.description && (
            <p className="line-clamp-3 text-muted-foreground text-sm">
              {previewEvent.description}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {isSynced && (
              <Badge variant="outline" className="gap-1">
                <ExternalLink className="h-3 w-3" />
                {provider}
              </Badge>
            )}
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
                onClick={async () => {
                  await deleteEvent(previewEvent.id);
                  closePreview();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => {
                openEventEditor(previewEvent.id);
                closePreview();
              }}
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
