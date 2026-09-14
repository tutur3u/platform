'use client';
import { useMutation } from '@tanstack/react-query';
import type {
  LettinDraft,
  LettinRecord,
  LettinRole,
} from '@tuturuuu/internal-api/lettin';
import { uploadLettinArtwork } from '@tuturuuu/internal-api/lettin';
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
import { DocumentView } from './document-view';
import { RichEditor } from './rich-editor';
import { useLettinMutation } from './use-lettin';
export function EntryEditor({
  wsId,
  worldId,
  record,
  worldRole,
  isWorld,
  entries,
  onDirty,
}: {
  wsId: string;
  worldId: string;
  record: LettinRecord;
  worldRole: LettinRole;
  isWorld: boolean;
  entries: LettinRecord[];
  onDirty: (value: boolean) => void;
}) {
  const t = useTranslations('lettin');
  const mutation = useLettinMutation(wsId);
  const [draft, setDraft] = useState(record.draft);
  const [version, setVersion] = useState(record.version);
  const [dirty, setDirty] = useState(false);
  const [tagsText, setTagsText] = useState(record.draft.tags.join(', '));
  const [saved, setSaved] = useState(false);
  const editGeneration = useRef(0);
  const update = (patch: Partial<LettinDraft>) => {
    editGeneration.current += 1;
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setSaved(false);
    onDirty(true);
  };
  const upload = useMutation({
    mutationFn: (file: File) => uploadLettinArtwork(wsId, worldId, file),
    onMutate: () => {
      editGeneration.current += 1;
      onDirty(true);
    },
    onError: () => onDirty(dirty),
    onSuccess: (result) => update({ image: result.image }),
  });
  const save = async () => {
    const submittedGeneration = editGeneration.current;
    try {
      await mutation.mutateAsync(
        isWorld
          ? { action: 'saveWorld', worldId, version, draft }
          : { action: 'saveEntry', worldId, entryId: record.id, version, draft }
      );
      setVersion((v) => v + 1);
      // Typing and artwork uploads can finish while the save is in flight.
      if (editGeneration.current === submittedGeneration) {
        setDirty(false);
        onDirty(false);
        setSaved(true);
      }
    } catch {
      /* Mutation owns the accessible error. */
    }
  };
  const publish = async (publish: boolean) => {
    try {
      await mutation.mutateAsync(
        isWorld
          ? {
              action: publish ? 'publishWorld' : 'unpublishWorld',
              worldId,
              version,
            }
          : {
              action: publish ? 'publishEntry' : 'unpublishEntry',
              worldId,
              entryId: record.id,
              version,
            }
      );
      setVersion((v) => v + 1);
    } catch {
      /* Keep current draft on conflicts. */
    }
  };
  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs uppercase tracking-widest">
          {t(isWorld ? 'worldDetails' : 'entry')} ·{' '}
          {t(record.published_at ? 'published' : 'draft')}
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t('preview')}</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t('privatePreview')}</DialogTitle>
              <DialogDescription>{t('previewHint')}</DialogDescription>
            </DialogHeader>
            <DocumentView draft={draft} />
          </DialogContent>
        </Dialog>
      </div>
      <label className="block space-y-2 text-sm">
        {t('title')}
        <Input
          value={draft.title}
          maxLength={160}
          onChange={(e) => update({ title: e.target.value })}
        />
      </label>
      <label className="block space-y-2 text-sm">
        {t('description')}
        <Textarea
          value={draft.description}
          maxLength={2000}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm">
          {t('imageUrl')}
          <Input
            type="url"
            value={draft.image}
            placeholder="https://"
            onChange={(e) => update({ image: e.target.value })}
          />
        </label>
        <label className="block space-y-2 text-sm">
          {t('credit')}
          <Input
            value={draft.credit}
            maxLength={200}
            onChange={(e) => update({ credit: e.target.value })}
          />
        </label>
      </div>
      {!isWorld && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm">
            {t('kind')}
            <select
              className="block w-full rounded border border-input bg-card p-2"
              value={draft.kind}
              onChange={(e) =>
                update({ kind: e.target.value as LettinDraft['kind'] })
              }
            >
              {(
                ['page', 'character', 'location', 'lore', 'story'] as const
              ).map((kind) => (
                <option key={kind} value={kind}>
                  {t(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            {t('tags')}
            <Input
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                update({
                  tags: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 20),
                });
              }}
            />
          </label>
        </div>
      )}
      <label className="block space-y-2 text-sm">
        {t('uploadArtwork')}
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = '';
            if (file) upload.mutate(file);
          }}
        />
        <span className="text-muted-foreground text-xs">{t('uploadHint')}</span>
      </label>
      {upload.isError && <p role="alert">{t('requestFailed')}</p>}
      <RichEditor
        value={draft.content}
        onChange={(content) => update({ content })}
      />
      {!isWorld && (
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-2 text-sm">{t('linkedEntries')}</legend>
          <p className="mb-3 text-muted-foreground text-xs">{t('linksHint')}</p>
          <div className="flex max-h-40 flex-wrap gap-4 overflow-y-auto">
            {entries
              .filter((e) => e.id !== record.id)
              .map((entry) => (
                <label
                  key={entry.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={draft.links.includes(entry.id)}
                    onChange={(e) =>
                      update({
                        links: e.target.checked
                          ? [...draft.links, entry.id]
                          : draft.links.filter((id) => id !== entry.id),
                      })
                    }
                  />
                  {entry.draft.title}
                </label>
              ))}
          </div>
        </fieldset>
      )}
      <div className="sticky bottom-3 space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={
              mutation.isPending ||
              upload.isPending ||
              !dirty ||
              !draft.title.trim()
            }
            onClick={save}
          >
            {t('saveDraft')}
          </Button>
          {worldRole !== 'editor' && (
            <>
              <Button
                variant="outline"
                disabled={mutation.isPending || upload.isPending || dirty}
                onClick={() => publish(true)}
              >
                {t(record.published_at ? 'republish' : 'publish')}
              </Button>
              {record.published_at && (
                <Button
                  variant="ghost"
                  disabled={mutation.isPending || upload.isPending || dirty}
                  onClick={() => publish(false)}
                >
                  {t('unpublish')}
                </Button>
              )}
            </>
          )}
          <span role="status" className="text-muted-foreground text-xs">
            {dirty ? t('unsaved') : saved ? t('saved') : t('draftHint')}
          </span>
        </div>
        {mutation.errorMessage && (
          <p className="text-sm" role="alert">
            {mutation.errorMessage}
          </p>
        )}
      </div>
    </section>
  );
}
