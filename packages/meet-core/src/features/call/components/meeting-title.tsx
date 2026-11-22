'use client';
import { Check, Circle, Leaf, Loader2, Pencil, X } from '@tuturuuu/icons';
import { updateMeetCallTitle } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { MeetingActionHint } from './meeting-action-hint';

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
    <div className="min-w-0 shrink">
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
          <MeetingActionHint label={t('edit_title')}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="group flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('edit_title_of', { title: displayed })}
              >
                <h1 className="truncate font-medium text-sm">{displayed}</h1>
                <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-50 group-hover:opacity-100" />
              </button>
            </DialogTrigger>
          </MeetingActionHint>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('edit_title')}</DialogTitle>
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
              <div className="grid gap-2">
                <Label htmlFor={id}>{t('meeting_title')}</Label>
                <Input
                  id={id}
                  autoFocus
                  maxLength={255}
                  value={draft}
                  disabled={busy}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  <X className="size-4" />
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={busy || !draft.trim()}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Check className="size-4" />
                  )}
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

/** Quiet status chips beside the title: solo mode and live recording. */
export function MeetingStatus({
  solo,
  recording,
}: {
  solo: boolean;
  recording: boolean;
}) {
  const t = useTranslations('meet.call');
  return (
    <>
      {solo && (
        <MeetingActionHint label={t('solo_mode')}>
          <output
            aria-label={t('solo_mode')}
            className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Leaf className="size-4" />
          </output>
        </MeetingActionHint>
      )}
      {recording && (
        <output
          aria-live="polite"
          className="flex h-8 items-center gap-1.5 rounded-full bg-destructive/10 px-3 text-destructive text-xs"
        >
          <Circle className="size-2 fill-current motion-safe:animate-pulse" />
          {t('recording')}
        </output>
      )}
    </>
  );
}
