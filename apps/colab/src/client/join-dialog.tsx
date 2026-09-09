import { ArrowRight } from '@tuturuuu/icons';
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
import { useCopy } from './i18n';
import { closeWorkspaceDialog } from './navigation';

export function JoinRoomDialog({
  open,
  navigate,
}: {
  open: boolean;
  navigate: (id: string) => void;
}) {
  const c = useCopy();
  const [invalid, setInvalid] = useState(false);
  const recent = localStorage.getItem('colab-recent-room');
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) closeWorkspaceDialog();
        setInvalid(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{c.join}</DialogTitle>
          <DialogDescription>{c.inviteHelp}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(
              new FormData(event.currentTarget).get('room')
            ).trim();
            let id = value;
            try {
              id = new URL(value).searchParams.get('room') ?? value;
            } catch {}
            if (/^[a-f0-9-]{36}$/.test(id)) {
              setInvalid(false);
              navigate(id);
            } else setInvalid(true);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="join-room-id">{c.roomId}</Label>
            <Input
              id="join-room-id"
              name="room"
              autoComplete="off"
              spellCheck={false}
              required
              placeholder="https://colab.tuturuuu.com/?room=…"
              aria-invalid={invalid}
              aria-describedby={invalid ? 'join-room-error' : undefined}
              onChange={() => setInvalid(false)}
            />
            {invalid && (
              <p
                id="join-room-error"
                role="alert"
                className="text-destructive text-sm"
              >
                {c.workspace.invalidRoom}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full">
            {c.join}
            <ArrowRight className="size-4" />
          </Button>
          {recent && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(recent)}
            >
              {c.recent}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
