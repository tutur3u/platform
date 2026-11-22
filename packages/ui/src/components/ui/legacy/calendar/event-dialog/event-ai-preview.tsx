'use client';

import {
  Brain,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Unlock,
} from '@tuturuuu/icons';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { getEventStyles } from '@tuturuuu/utils/color-helper';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { COLOR_OPTIONS, OverlapWarning } from '../event-form-components';
import { EventDialogBody, EventDialogFooter } from './event-dialog-frame';

export interface EventAiPreviewProps {
  events: Partial<CalendarEvent>[];
  index: number;
  timeFormat?: '12h' | '24h';
  suggestions: string[];
  overlappingEvents: CalendarEvent[];
  showOverlapWarning: boolean;
  isSaving: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onBack: () => void;
  onEditDetails: () => void;
  onSave: () => void;
}

/** Review of the generated events before they are saved. */
export function EventAiPreview({
  events,
  index,
  timeFormat,
  suggestions,
  overlappingEvents,
  showOverlapWarning,
  isSaving,
  onPrevious,
  onNext,
  onBack,
  onEditDetails,
  onSave,
}: EventAiPreviewProps) {
  const t = useTranslations('calendar.event_dialog');
  const event = events[index];
  const count = events.length;
  const timePattern = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';
  const colorKey = (event?.color ?? 'BLUE').toUpperCase();
  const styles = event?.color ? getEventStyles(event.color) : null;
  const colorName =
    COLOR_OPTIONS.find((option) => option.value === colorKey)?.name ?? colorKey;

  return (
    <>
      <EventDialogBody>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-base">
              {t('preview_title', { count })}
            </h3>
            {count > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  aria-label={t('previous_event')}
                  className="size-8"
                  disabled={index === 0}
                  onClick={onPrevious}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <span
                  aria-live="polite"
                  className="min-w-12 text-center text-muted-foreground text-sm tabular-nums"
                >
                  {t('preview_position', { current: index + 1, total: count })}
                </span>
                <Button
                  aria-label={t('next_event')}
                  className="size-8"
                  disabled={index >= count - 1}
                  onClick={onNext}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>

          {event && (
            <article className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <h4 className="font-semibold text-lg">{event.title}</h4>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon aria-hidden="true" className="size-3.5" />
                  {format(new Date(event.start_at || ''), 'PPP')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden="true" className="size-3.5" />
                  {format(new Date(event.start_at || ''), timePattern)} –{' '}
                  {format(new Date(event.end_at || ''), timePattern)}
                </span>
                {event.location && (
                  <a
                    className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <MapPin aria-hidden="true" className="size-3.5" />
                    {event.location}
                  </a>
                )}
              </div>
              {event.description && (
                <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                  {event.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-muted-foreground text-xs">
                {styles && (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 font-medium',
                      styles.bg,
                      styles.border,
                      styles.text
                    )}
                  >
                    {colorName}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Unlock aria-hidden="true" className="size-3.5" />
                  {t('preview_unlocked')}
                </span>
              </div>
            </article>
          )}

          {suggestions.length > 0 && (
            <section className="rounded-lg border bg-muted/30 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
                <Brain aria-hidden="true" className="size-4 text-primary" />
                {t('preview_insights')}
              </h4>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            </section>
          )}

          {showOverlapWarning && (
            <OverlapWarning overlappingEvents={overlappingEvents} />
          )}
        </div>
      </EventDialogBody>
      <EventDialogFooter
        start={
          <>
            <Button onClick={onBack} type="button" variant="ghost">
              <ChevronLeft aria-hidden="true" />
              {t('back')}
            </Button>
            <Button
              disabled={!event}
              onClick={onEditDetails}
              type="button"
              variant="outline"
            >
              <FileText aria-hidden="true" />
              <span className="max-sm:sr-only">{t('edit_details')}</span>
            </Button>
          </>
        }
      >
        <Button
          disabled={isSaving || count === 0}
          onClick={onSave}
          type="button"
        >
          {isSaving && <Loader2 aria-hidden="true" className="animate-spin" />}
          {isSaving ? t('saving') : t('save_generated', { count })}
        </Button>
      </EventDialogFooter>
    </>
  );
}
