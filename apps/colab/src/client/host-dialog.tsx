import { useMutation } from '@tanstack/react-query';
import { CalendarClock, X } from '@tuturuuu/icons';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import { type RoomView, workshopScheduleError } from '@tuturuuu/multiplayer';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useState } from 'react';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
import { closeWorkspaceDialog, WorkspaceLink } from './navigation';

function dateValue(time: number | null) {
  if (time === null) return '';
  const date = new Date(time);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
export function HostWorkshopDialog({
  open,
  canHost,
  navigate,
}: {
  open: boolean;
  canHost: boolean;
  navigate: (id: string) => void;
}) {
  const c = useCopy();
  const start = Date.now() + 5 * 60_000;
  const [draft, setDraft] = useState(() => ({
    title: c.defaultTitle,
    starts: dateValue(start),
    ends: dateValue(start + 60 * 60_000),
    capacity: '24',
    teams: '4',
  }));
  const [formError, setFormError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      colabRequest<RoomView>('/rooms', {
        title: draft.title,
        startsAt: draft.starts ? new Date(draft.starts).getTime() : null,
        endsAt: draft.ends ? new Date(draft.ends).getTime() : null,
        maxUsers: Number(draft.capacity),
        teamCount: Number(draft.teams),
      }),
    onSuccess: (room) => navigate(room.id),
  });
  const update = (key: keyof typeof draft, value: string) => {
    setFormError(null);
    if (!create.isPending) create.reset();
    setDraft((current) => ({ ...current, [key]: value }));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setFormError(null);
          if (!create.isPending) create.reset();
          closeWorkspaceDialog();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{c.host}</DialogTitle>
          <DialogDescription>
            {canHost ? c.scheduleHelp : c.hostOnly}
          </DialogDescription>
        </DialogHeader>
        {canHost ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              const issue = workshopScheduleError(
                draft.starts ? new Date(draft.starts).getTime() : null,
                draft.ends ? new Date(draft.ends).getTime() : null
              );
              if (issue) {
                setFormError(c.scheduleErrors[issue]);
                return;
              }
              setFormError(null);
              create.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="host-title">{c.title}</Label>
              <Input
                id="host-title"
                name="title"
                autoComplete="off"
                disabled={create.isPending}
                required
                maxLength={100}
                value={draft.title}
                placeholder={c.workshopNamePlaceholder}
                onChange={(event) => update('title', event.target.value)}
              />
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-4 flex items-start gap-3">
                <CalendarClock
                  className="mt-0.5 size-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="font-medium text-sm">{c.scheduleTitle}</p>
                  <p className="text-muted-foreground text-xs">
                    {c.scheduleFieldHelp}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="host-starts">{c.starts}</Label>
                    {draft.starts && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => update('starts', '')}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        {c.unset}
                      </Button>
                    )}
                  </div>
                  <Input
                    id="host-starts"
                    name="starts"
                    type="datetime-local"
                    autoComplete="off"
                    disabled={create.isPending}
                    aria-describedby="host-schedule-help"
                    value={draft.starts}
                    onChange={(event) => update('starts', event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="host-ends">{c.ends}</Label>
                    {draft.ends && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => update('ends', '')}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        {c.unset}
                      </Button>
                    )}
                  </div>
                  <Input
                    id="host-ends"
                    name="ends"
                    type="datetime-local"
                    autoComplete="off"
                    disabled={create.isPending}
                    aria-describedby="host-schedule-help"
                    value={draft.ends}
                    onChange={(event) => update('ends', event.target.value)}
                  />
                </div>
              </div>
              <p id="host-schedule-help" className="sr-only">
                {c.scheduleFieldHelp}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="host-capacity">{c.capacity}</Label>
                <Input
                  id="host-capacity"
                  name="capacity"
                  type="number"
                  autoComplete="off"
                  disabled={create.isPending}
                  min={2}
                  max={100}
                  required
                  value={draft.capacity}
                  placeholder="24"
                  onChange={(event) => update('capacity', event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="host-teams">{c.teamCount}</Label>
                <Input
                  id="host-teams"
                  name="teams"
                  type="number"
                  autoComplete="off"
                  disabled={create.isPending}
                  min={1}
                  max={12}
                  required
                  value={draft.teams}
                  placeholder="4"
                  onChange={(event) => update('teams', event.target.value)}
                />
              </div>
            </div>
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <ErrorNotice error={create.error} />
            <Button
              type="submit"
              className="w-full"
              disabled={create.isPending}
            >
              {create.isPending ? c.working : c.create}
            </Button>
          </form>
        ) : (
          <Button asChild>
            <WorkspaceLink href="/join">{c.join}</WorkspaceLink>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
