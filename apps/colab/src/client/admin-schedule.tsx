import { CalendarClock, X } from '@tuturuuu/icons';
import { type RoomView, workshopScheduleError } from '@tuturuuu/multiplayer';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useState } from 'react';
import { useCopy } from './i18n';

function dateValue(time: number | null) {
  if (time === null) return '';
  const date = new Date(time);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function AdminSchedule({
  room,
  action,
  busy,
}: {
  room: RoomView;
  action: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const c = useCopy();
  const [starts, setStarts] = useState(() => dateValue(room.startsAt));
  const [ends, setEnds] = useState(() => dateValue(room.endsAt));
  const [error, setError] = useState<string | null>(null);
  const clear = (setter: (value: string) => void) => {
    setter('');
    setError(null);
  };
  return (
    <div className="admin-tab-content">
      <div className="admin-tab-heading">
        <div>
          <h3>{c.scheduleTitle}</h3>
          <p>{c.scheduleManagementHelp}</p>
        </div>
        <CalendarClock
          className="size-5 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const startsAt = starts ? new Date(starts).getTime() : null;
          const endsAt = ends ? new Date(ends).getTime() : null;
          const issue = workshopScheduleError(
            startsAt,
            endsAt,
            Date.now(),
            true
          );
          if (issue) return setError(c.scheduleErrors[issue]);
          setError(null);
          void action({ action: 'schedule', startsAt, endsAt }).catch(() => {});
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Label>
            <span className="flex items-center justify-between gap-2">
              {c.starts}
              {starts && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => clear(setStarts)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  {c.unset}
                </Button>
              )}
            </span>
            <Input
              name="starts-at"
              type="datetime-local"
              autoComplete="off"
              value={starts}
              onChange={(event) => {
                setStarts(event.target.value);
                setError(null);
              }}
            />
          </Label>
          <Label>
            <span className="flex items-center justify-between gap-2">
              {c.ends}
              {ends && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => clear(setEnds)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  {c.unset}
                </Button>
              )}
            </span>
            <Input
              name="ends-at"
              type="datetime-local"
              autoComplete="off"
              value={ends}
              onChange={(event) => {
                setEnds(event.target.value);
                setError(null);
              }}
            />
          </Label>
        </div>
        <p className="fine-print">{c.scheduleFieldHelp}</p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={busy} className="sm:justify-self-start">
          {busy ? c.working : c.saveSchedule}
        </Button>
      </form>
    </div>
  );
}
