'use client';
import type { LettinKind } from '@tuturuuu/internal-api/lettin';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { quickNoteDraft } from './quick-note-model';
import { useLettinMutation } from './use-lettin';
import { entryKinds } from './wiki-model';

export function QuickNote({
  wsId,
  worldId,
  disabled,
  onCreated,
}: {
  wsId: string;
  worldId: string;
  disabled: boolean;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('lettin');
  const mutation = useLettinMutation(wsId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<LettinKind>('page');
  const [busy, setBusy] = useState(false);
  const [reviewDiscard, setReviewDiscard] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const submitting = useRef(false);
  const blocked = disabled || busy || mutation.isPending;
  const editingBlocked = blocked || reviewDiscard;
  const hasLocalDraft = title !== '' || body !== '' || kind !== 'page';
  const draft = quickNoteDraft(title, body, kind);
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (submitting.current) return;
          if (value) mutation.reset();
          setReviewDiscard(false);
          setOpen(value);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" disabled={blocked}>
            {t('quickNote')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('quickNote')}</DialogTitle>
            <DialogDescription>{t('quickNoteHint')}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (editingBlocked || submitting.current || !draft) return;
              submitting.current = true;
              setBusy(true);
              try {
                const result = await mutation.mutateAsync({
                  action: 'createEntry',
                  worldId,
                  draft,
                });
                setCreatedId(result.id);
                setTitle('');
                setBody('');
                setKind('page');
                setOpen(false);
              } catch {
                /* Preserve the note; the mutation displays its error. */
              } finally {
                submitting.current = false;
                setBusy(false);
              }
            }}
          >
            <Input
              aria-label={t('title')}
              required
              maxLength={160}
              value={title}
              disabled={editingBlocked}
              onChange={(event) => setTitle(event.target.value)}
            />
            <select
              aria-label={t('kind')}
              value={kind}
              disabled={editingBlocked}
              onChange={(event) => setKind(event.target.value as LettinKind)}
            >
              {entryKinds.map((value) => (
                <option key={value} value={value}>
                  {t(`kind${value}`)}
                </option>
              ))}
            </select>
            <Textarea
              aria-label={t('quickNoteBody')}
              required
              maxLength={10000}
              rows={8}
              value={body}
              disabled={editingBlocked}
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="text-muted-foreground text-sm">
              {t('quickNoteBounds')}
            </p>
            <Button type="submit" disabled={editingBlocked || !draft}>
              {t('saveQuickNote')}
            </Button>
            {reviewDiscard ? (
              <fieldset className="space-y-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm">
                  {t('quickNoteDiscardTitle')}
                </legend>
                <p className="text-muted-foreground text-sm">
                  {t('quickNoteDiscardHint')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={blocked}
                    onClick={() => {
                      if (!blocked) setReviewDiscard(false);
                    }}
                  >
                    {t('keepQuickNoteDraft')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={blocked}
                    onClick={() => {
                      if (blocked || submitting.current) return;
                      setTitle('');
                      setBody('');
                      setKind('page');
                      setReviewDiscard(false);
                      mutation.reset();
                    }}
                  >
                    {t('confirmQuickNoteDiscard')}
                  </Button>
                </div>
              </fieldset>
            ) : (
              <Button
                type="button"
                variant="ghost"
                disabled={blocked || !hasLocalDraft}
                onClick={() => {
                  if (!blocked && hasLocalDraft) setReviewDiscard(true);
                }}
              >
                {t('discardQuickNoteDraft')}
              </Button>
            )}
            {mutation.errorMessage && (
              <p role="alert">{mutation.errorMessage}</p>
            )}
          </form>
        </DialogContent>
      </Dialog>
      {createdId && (
        <div role="status" className="space-y-2">
          <p>{t('quickNoteSaved')}</p>
          <Button
            variant="ghost"
            disabled={blocked}
            onClick={() => {
              if (!blocked) onCreated(createdId);
            }}
          >
            {t('openQuickNote')}
          </Button>
        </div>
      )}
    </>
  );
}
