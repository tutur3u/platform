'use client';

import {
  AlignLeft,
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  Trash2,
  Unlock,
} from '@tuturuuu/icons';
import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Kbd } from '@tuturuuu/ui/kbd';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type {
  Dispatch,
  KeyboardEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import type { CalendarEventCreationDraft } from '../../../../../hooks/calendar-event-create-payload';
import { CalendarEventParticipants } from '../calendar-event-guests';
import { DateError, OverlapWarning } from '../event-form-components';
import { ProviderColorPicker } from '../provider-color-picker';
import {
  EventDialogBody,
  EventDialogFooter,
  EventFieldIcon,
} from './event-dialog-frame';
import { eventDialogKey, isEventFieldSubmitKey } from './event-dialog-keys';

export interface EventQuickEntryProps {
  event: CalendarEventCreationDraft;
  setEvent: Dispatch<SetStateAction<CalendarEventCreationDraft>>;
  isEditing: boolean;
  workspaceId?: string;
  timeZone?: string;
  when: ReactNode;
  sourceOptions: CalendarSourceOption[];
  selectedSource?: CalendarSourceOption;
  onSourceChange: (sourceId: string) => void;
  isSaving: boolean;
  isDeleting: boolean;
  dateError: string | null;
  overlappingEvents: CalendarEvent[];
  showOverlapWarning: boolean;
  recoveryNotice?: ReactNode;
  titleRef?: RefObject<HTMLInputElement | null>;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
}

/** The Quick entry tab: every event field, then the fixed action row. */
export function EventQuickEntry({
  event,
  setEvent,
  isEditing,
  workspaceId,
  timeZone,
  when,
  sourceOptions,
  selectedSource,
  onSourceChange,
  isSaving,
  isDeleting,
  dateError,
  overlappingEvents,
  showOverlapWarning,
  recoveryNotice,
  titleRef,
  onSave,
  onCancel,
  onDelete,
  onToggleLock,
}: EventQuickEntryProps) {
  const t = useTranslations('calendar.event_dialog');
  const busy = isSaving || isDeleting;
  const saveOnEnter = (keyEvent: KeyboardEvent<HTMLInputElement>) => {
    if (!isEventFieldSubmitKey(eventDialogKey(keyEvent))) return;
    keyEvent.preventDefault();
    onSave();
  };

  return (
    <>
      <EventDialogBody>
        <div className="flex flex-col gap-5">
          <Input
            ref={titleRef}
            aria-label={t('title_label')}
            autoFocus
            className="-mx-2 h-auto w-[calc(100%+1rem)] border-transparent bg-transparent px-2 py-1 font-semibold text-2xl shadow-none placeholder:text-muted-foreground/70 hover:bg-muted/50 focus:border-transparent md:text-2xl"
            onChange={(change) =>
              setEvent((previous) => ({
                ...previous,
                title: change.target.value,
              }))
            }
            onFocus={(focus) => focus.target.select()}
            onKeyDown={saveOnEnter}
            placeholder={t('title_placeholder')}
            value={event.title || ''}
          />

          <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3">
            <EventFieldIcon>
              <Clock />
            </EventFieldIcon>
            {when}

            <EventFieldIcon>
              <CalendarIcon />
            </EventFieldIcon>
            <div className="flex min-w-0 gap-2">
              <Select
                value={selectedSource?.id}
                onValueChange={onSourceChange}
                disabled={sourceOptions.length === 0 || isSaving}
              >
                <SelectTrigger
                  aria-label={t('calendar_label')}
                  className="min-w-0 flex-1"
                >
                  <SelectValue placeholder={t('calendar_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
                          style={
                            option.color
                              ? { backgroundColor: option.color }
                              : undefined
                          }
                        />
                        <span className="truncate">{option.label}</span>
                        {option.provider !== 'tuturuuu' &&
                          option.accountEmail && (
                            <span className="truncate text-muted-foreground text-xs">
                              {option.accountEmail}
                            </span>
                          )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ProviderColorPicker
                compact
                wsId={workspaceId}
                source={selectedSource}
                value={event.color || 'BLUE'}
                metadata={event.scheduling_metadata}
                choice={event.providerColor}
                onNativeChange={(color) =>
                  setEvent((previous) => ({
                    ...previous,
                    color,
                    providerColor: undefined,
                  }))
                }
                onProviderChange={(providerColor) =>
                  setEvent((previous) => ({ ...previous, providerColor }))
                }
              />
            </div>

            <EventFieldIcon>
              <MapPin />
            </EventFieldIcon>
            <div className="relative min-w-0">
              <Input
                aria-label={t('location_label')}
                className={cn(event.location && 'pr-10')}
                onChange={(change) =>
                  setEvent((previous) => ({
                    ...previous,
                    location: change.target.value,
                  }))
                }
                onKeyDown={saveOnEnter}
                placeholder={t('location_placeholder')}
                value={event.location || ''}
              />
              {event.location && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        aria-label={t('open_in_maps')}
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink aria-hidden="true" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('open_in_maps')}</TooltipContent>
                </Tooltip>
              )}
            </div>

            <EventFieldIcon>
              <AlignLeft />
            </EventFieldIcon>
            <Textarea
              aria-label={t('description_label')}
              className="max-h-60 min-h-20 resize-none"
              onChange={(change) =>
                setEvent((previous) => ({
                  ...previous,
                  description: change.target.value,
                }))
              }
              placeholder={t('description_placeholder')}
              value={event.description || ''}
            />

            <div className="col-start-2 flex min-w-0 flex-col gap-3 empty:hidden">
              <CalendarEventParticipants
                event={event}
                onChange={setEvent}
                source={selectedSource}
                workspaceId={workspaceId}
                isEditing={isEditing}
                timeZone={timeZone}
              />
            </div>
          </div>

          {(showOverlapWarning || dateError) && (
            <div className="flex flex-col gap-3 [&>*]:mt-0">
              {showOverlapWarning && (
                <OverlapWarning overlappingEvents={overlappingEvents} />
              )}
              {dateError && <DateError error={dateError} />}
            </div>
          )}
        </div>
      </EventDialogBody>

      <EventDialogFooter
        notice={recoveryNotice}
        start={
          <>
            {isEditing && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t('delete')}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={onDelete}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {isDeleting ? (
                      <Loader2 aria-hidden="true" className="animate-spin" />
                    ) : (
                      <Trash2 aria-hidden="true" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('delete')}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-pressed={Boolean(event.locked)}
                  className={cn(
                    'text-muted-foreground',
                    event.locked &&
                      'bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/15 hover:text-dynamic-orange'
                  )}
                  disabled={busy}
                  onClick={onToggleLock}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {event.locked ? (
                    <Lock aria-hidden="true" />
                  ) : (
                    <Unlock aria-hidden="true" />
                  )}
                  <span className="max-sm:sr-only">{t('lock')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {event.locked ? t('locked_hint') : t('unlocked_hint')}
              </TooltipContent>
            </Tooltip>
          </>
        }
      >
        <Button
          disabled={busy}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          {t('cancel')}
        </Button>
        <Button disabled={busy} onClick={onSave} type="button">
          {isSaving && <Loader2 aria-hidden="true" className="animate-spin" />}
          {isSaving ? t('saving') : isEditing ? t('save') : t('create')}
          <SaveShortcutHint />
        </Button>
      </EventDialogFooter>
    </>
  );
}

/** The Cmd/Ctrl+Enter hint inside the save button, for pointer screens. */
export function SaveShortcutHint() {
  const isApple =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/u.test(navigator.platform);
  return (
    <Kbd
      aria-hidden="true"
      className="bg-primary-foreground/15 text-primary-foreground/80 max-sm:hidden"
    >
      {isApple ? '\u2318\u21B5' : 'Ctrl \u21B5'}
    </Kbd>
  );
}
