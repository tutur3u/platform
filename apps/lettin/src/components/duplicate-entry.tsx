'use client';
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
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
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useLettinMutation } from './use-lettin';

export function DuplicateEntry({
  wsId,
  worldId,
  record,
  disabled,
  onCreated,
}: {
  wsId: string;
  worldId: string;
  record: LettinRecord;
  disabled: boolean;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('lettin');
  const mutation = useLettinMutation(wsId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [linkSource, setLinkSource] = useState(false);
  const [context, setContext] = useState('');
  const contextText = record.draft.kind === 'character' ? context.trim() : '';
  const contextBlocked =
    !!contextText && (record.draft.wiki?.facts.length ?? 0) >= 40;
  const [createdId, setCreatedId] = useState<string | null>(null);
  const submitting = useRef(false);
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (submitting.current) return;
          if (value) {
            setTitle('');
            setLinkSource(false);
            setContext('');
            mutation.reset();
          }
          setOpen(value);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" disabled={disabled || mutation.isPending}>
            {t('duplicateEntry')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('duplicateEntry')}</DialogTitle>
            <DialogDescription>{t('duplicateEntryHint')}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                disabled ||
                submitting.current ||
                !title.trim() ||
                contextBlocked
              )
                return;
              submitting.current = true;
              try {
                const result = await mutation.mutateAsync({
                  action: 'duplicateEntry',
                  worldId,
                  entryId: record.id,
                  version: record.version,
                  title: title.trim(),
                  ...(linkSource ? { linkSource: true } : {}),
                  ...(contextText
                    ? {
                        contextFact: {
                          label: t('copyCharacterContextFact'),
                          value: contextText,
                        },
                      }
                    : {}),
                });
                setOpen(false);
                setCreatedId(result.id);
              } catch {
                /* Mutation preserves the form and displays its error. */
              } finally {
                submitting.current = false;
              }
            }}
          >
            <Input
              aria-label={t('duplicateEntryTitle')}
              placeholder={t('duplicateEntryTitle')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={160}
              disabled={disabled || mutation.isPending}
            />
            {record.draft.kind === 'character' && (
              <label className="block space-y-2 text-sm">
                {t('copyCharacterContext')}
                <Input
                  value={context}
                  maxLength={1000}
                  disabled={disabled || mutation.isPending}
                  onChange={(event) => setContext(event.target.value)}
                />
                <span className="block text-muted-foreground text-xs">
                  {t('copyCharacterContextHint')}
                </span>
              </label>
            )}
            {contextBlocked && (
              <p role="alert">{t('copyCharacterContextLimit')}</p>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={linkSource}
                disabled={disabled || mutation.isPending}
                onChange={(event) => setLinkSource(event.target.checked)}
              />
              <span>
                {t('copyLinkSource')}
                <span className="mt-1 block text-muted-foreground text-xs">
                  {t('copyLinkSourceHint')}
                </span>
              </span>
            </label>
            <Button
              type="submit"
              disabled={
                disabled ||
                mutation.isPending ||
                !title.trim() ||
                contextBlocked
              }
            >
              {t('createEntryCopy')}
            </Button>
            {mutation.errorMessage && (
              <p role="alert">{mutation.errorMessage}</p>
            )}
          </form>
        </DialogContent>
      </Dialog>
      {createdId && (
        <Button
          variant="ghost"
          disabled={disabled || mutation.isPending}
          onClick={() => onCreated(createdId)}
        >
          {t('openEntryCopy')}
        </Button>
      )}
    </>
  );
}
