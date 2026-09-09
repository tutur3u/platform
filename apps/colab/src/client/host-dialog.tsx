import { useMutation } from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { RoomView } from '@tuturuuu/multiplayer';
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

function dateValue(time: number) {
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
  const [draft, setDraft] = useState(() => ({
    title: c.defaultTitle,
    starts: dateValue(Date.now() + 60_000),
    ends: dateValue(Date.now() + 3660_000),
    capacity: '24',
    teams: '4',
  }));
  const update = (key: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const create = useMutation({
    mutationFn: () =>
      colabRequest<RoomView>('/rooms', {
        title: draft.title,
        startsAt: new Date(draft.starts).getTime(),
        endsAt: new Date(draft.ends).getTime(),
        maxUsers: Number(draft.capacity),
        teamCount: Number(draft.teams),
      }),
    onSuccess: (room) => navigate(room.id),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) closeWorkspaceDialog();
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
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="host-title">{c.title}</Label>
              <Input
                id="host-title"
                name="title"
                required
                maxLength={100}
                value={draft.title}
                placeholder={c.workshopNamePlaceholder}
                onChange={(event) => update('title', event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="host-starts">{c.starts}</Label>
                <Input
                  id="host-starts"
                  name="starts"
                  type="datetime-local"
                  required
                  value={draft.starts}
                  onChange={(event) => update('starts', event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="host-ends">{c.ends}</Label>
                <Input
                  id="host-ends"
                  name="ends"
                  type="datetime-local"
                  required
                  value={draft.ends}
                  onChange={(event) => update('ends', event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="host-capacity">{c.capacity}</Label>
                <Input
                  id="host-capacity"
                  name="capacity"
                  type="number"
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
                  min={1}
                  max={12}
                  required
                  value={draft.teams}
                  placeholder="4"
                  onChange={(event) => update('teams', event.target.value)}
                />
              </div>
            </div>
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
