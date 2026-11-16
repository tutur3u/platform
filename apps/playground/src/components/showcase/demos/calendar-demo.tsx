'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { type FormEvent, useId, useReducer, useState } from 'react';
import {
  CALENDAR_DAYS,
  CALENDAR_HOURS,
  type CalendarEvent,
  calendarReducer,
  findConflicts,
  formatHour,
  formatSlot,
  initialCalendarState,
  sortEvents,
} from '@/lib/showcase/calendar';
import { hasRoom, SHOWCASE_LIMITS } from '@/lib/showcase/limits';
import { DemoPanel, FieldMessage } from '../demo-panel';
import { fieldLabel, focusRing, selectField } from '../styles';

function SlotFields({
  day,
  hour,
  onDay,
  onHour,
}: {
  day: number;
  hour: number;
  onDay: (day: number) => void;
  onHour: (hour: number) => void;
}) {
  const dayId = useId();
  const hourId = useId();
  return (
    <>
      <div className="space-y-1.5">
        <label className={fieldLabel} htmlFor={dayId}>
          Day
        </label>
        <select
          className={selectField}
          id={dayId}
          onChange={(event) => onDay(Number(event.target.value))}
          value={day}
        >
          {CALENDAR_DAYS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className={fieldLabel} htmlFor={hourId}>
          Time
        </label>
        <select
          className={selectField}
          id={hourId}
          onChange={(event) => onHour(Number(event.target.value))}
          value={hour}
        >
          {CALENDAR_HOURS.map((value) => (
            <option key={value} value={value}>
              {formatHour(value)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export function CalendarDemo() {
  const [state, dispatch] = useReducer(calendarReducer, initialCalendarState);
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(2);
  const [hour, setHour] = useState(10);
  const titleId = useId();
  const messageId = useId();
  const full = !hasRoom(state.events, SHOWCASE_LIMITS.listItems);
  const conflicts = findConflicts(state.events);
  const selected =
    state.events.find((event) => event.id === selectedId) ?? null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || full) return;
    dispatch({ type: 'add', title, day, hour });
    setSelectedId(state.nextId);
    setTitle('');
  };

  return (
    <DemoPanel
      label="Calendar demo"
      onReset={() => {
        dispatch({ type: 'reset' });
        setSelectedId(1);
        setTitle('');
      }}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-5"
          role="list"
          aria-label="This week"
        >
          {CALENDAR_DAYS.map((label, dayIndex) => {
            const events = sortEvents(state.events).filter(
              (event) => event.day === dayIndex
            );
            return (
              <div
                key={label}
                className="rounded-lg bg-muted/50 p-2"
                role="listitem"
              >
                <h3 className="px-1 pb-2 font-semibold text-sm">{label}</h3>
                {events.length === 0 ? (
                  <p className="px-1 text-muted-foreground text-xs">Free</p>
                ) : (
                  <ul className="space-y-1.5">
                    {events.map((event) => (
                      <EventButton
                        key={event.id}
                        conflict={conflicts.has(event.id)}
                        event={event}
                        onSelect={() => setSelectedId(event.id)}
                        selected={event.id === selectedId}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-5">
          {selected ? (
            <RescheduleForm
              key={selected.id}
              event={selected}
              onRemove={() => {
                dispatch({ type: 'remove', id: selected.id });
                setSelectedId(null);
              }}
              onReschedule={(nextDay, nextHour) =>
                dispatch({
                  type: 'reschedule',
                  id: selected.id,
                  day: nextDay,
                  hour: nextHour,
                })
              }
            />
          ) : (
            <p className="rounded-lg border border-border border-dashed p-4 text-muted-foreground text-sm">
              Select an event to move it.
            </p>
          )}

          <form
            className="space-y-3 border-border border-t pt-5"
            onSubmit={submit}
          >
            <h3 className="font-semibold text-sm">New event</h3>
            <div className="space-y-1.5">
              <label className={fieldLabel} htmlFor={titleId}>
                Title
              </label>
              <Input
                aria-describedby={full ? messageId : undefined}
                autoComplete="off"
                disabled={full}
                id={titleId}
                maxLength={SHOWCASE_LIMITS.titleLength}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Planning session"
                value={title}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SlotFields
                day={day}
                hour={hour}
                onDay={setDay}
                onHour={setHour}
              />
            </div>
            {full ? (
              <FieldMessage id={messageId}>
                This week holds {SHOWCASE_LIMITS.listItems} events. Remove one
                or reset.
              </FieldMessage>
            ) : null}
            <Button
              className="w-full"
              disabled={full || !title.trim()}
              type="submit"
            >
              Add event
            </Button>
          </form>
        </div>
      </div>
    </DemoPanel>
  );
}

function EventButton({
  event,
  selected,
  conflict,
  onSelect,
}: {
  event: CalendarEvent;
  selected: boolean;
  conflict: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        aria-pressed={selected}
        className={cn(
          'w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-card hover:bg-accent hover:text-accent-foreground',
          focusRing
        )}
        onClick={onSelect}
        type="button"
      >
        <span className="block font-medium break-words">{event.title}</span>
        <span className={selected ? 'opacity-80' : 'text-muted-foreground'}>
          {formatHour(event.hour)}
          {conflict ? ' · Overlaps' : ''}
        </span>
      </button>
    </li>
  );
}

function RescheduleForm({
  event,
  onReschedule,
  onRemove,
}: {
  event: CalendarEvent;
  onReschedule: (day: number, hour: number) => void;
  onRemove: () => void;
}) {
  const [day, setDay] = useState(event.day);
  const [hour, setHour] = useState(event.hour);
  const unchanged = day === event.day && hour === event.hour;

  return (
    <form
      className="space-y-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        if (!unchanged) onReschedule(day, hour);
      }}
    >
      <div>
        <h3 className="font-semibold text-sm break-words">{event.title}</h3>
        <p className="text-muted-foreground text-sm">{formatSlot(event)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SlotFields day={day} hour={hour} onDay={setDay} onHour={setHour} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={unchanged} size="sm" type="submit">
          Reschedule
        </Button>
        <Button onClick={onRemove} size="sm" type="button" variant="ghost">
          Remove
        </Button>
      </div>
    </form>
  );
}
