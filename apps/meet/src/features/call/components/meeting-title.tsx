'use client';
import { Pencil } from '@tuturuuu/icons';
import { updateMeetCallTitle } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function MeetingTitle({
  meetingId,
  title,
  canManage,
  onSaved,
}: {
  meetingId: string;
  title: string;
  canManage: boolean;
  onSaved: (title: string) => void;
}) {
  const t = useTranslations('meet.call');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saved, setSaved] = useState<{ previous: string; name: string }>();
  const [busy, setBusy] = useState(false);
  const displayed = saved?.previous === title ? saved.name : title;
  return (
    <div className="min-w-0 flex-1">
      {canManage ? (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!busy) {
              setOpen(next);
              if (next) setDraft(displayed);
            }
          }}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              className="group flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('edit_title')}
            >
              <h1 className="truncate font-medium text-sm">{displayed}</h1>
              <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-50 group-hover:opacity-100" />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('edit_title')}</DialogTitle>
              <DialogDescription>{t('edit_title_hint')}</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy || !draft.trim()) return;
                setBusy(true);
                try {
                  const result = await updateMeetCallTitle(
                    meetingId,
                    draft.trim()
                  );
                  setSaved({ previous: title, name: result.name });
                  onSaved(result.name);
                  setOpen(false);
                } catch {
                  toast.error(t('title_save_failed'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Label htmlFor={id}>{t('meeting_title')}</Label>
              <Input
                id={id}
                autoFocus
                maxLength={255}
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={busy || !draft.trim()}>
                  {t(busy ? 'saving_title' : 'save_title')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <h1 className="truncate font-medium text-sm">{title}</h1>
      )}
    </div>
  );
}
