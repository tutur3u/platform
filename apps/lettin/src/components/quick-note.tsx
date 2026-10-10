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
  const [createdId, setCreatedId] = useState<string | null>(null);
  const submitting = useRef(false);
  const blocked = disabled || busy || mutation.isPending;
  const draft = quickNoteDraft(title, body, kind);
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (submitting.current) return;
          if (value) mutation.reset();
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
              if (blocked || submitting.current || !draft) return;
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
              disabled={blocked}
              onChange={(event) => setTitle(event.target.value)}
            />
            <select
              aria-label={t('kind')}
              value={kind}
              disabled={blocked}
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
              disabled={blocked}
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="text-muted-foreground text-sm">
              {t('quickNoteBounds')}
            </p>
            <Button type="submit" disabled={blocked || !draft}>
              {t('saveQuickNote')}
            </Button>
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
