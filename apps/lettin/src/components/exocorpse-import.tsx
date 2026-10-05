'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  applyLettinExocorpseImport,
  type LettinImportPreview,
  previewLettinExocorpseImport,
} from '@tuturuuu/internal-api/lettin';
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
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
export function ExocorpseImport({ wsId }: { wsId: string }) {
  const t = useTranslations('lettin'),
    client = useQueryClient(),
    router = useRouter();
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState('Exocorpse'),
    [source, setSource] = useState<'cms' | 'file'>('cms'),
    [payload, setPayload] = useState<unknown>(),
    [fileError, setFileError] = useState(false),
    [preview, setPreview] = useState<LettinImportPreview>();
  const inspect = useMutation({
    mutationFn: () =>
      previewLettinExocorpseImport(wsId, { title, source, payload }),
    onSuccess: setPreview,
  });
  const apply = useMutation({
    mutationFn: () => applyLettinExocorpseImport(wsId, preview!.id),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['lettin', wsId] });
      setOpen(false);
      router.push(`/${wsId}/wiki/${result.id}/overview`);
    },
  });
  const pending = inspect.isPending || apply.isPending;
  const error = apply.error ?? inspect.error;
  const reset = () => {
    setPreview(undefined);
    inspect.reset();
    apply.reset();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">{t('importExocorpse')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('importExocorpse')}</DialogTitle>
          <DialogDescription>{t('importExocorpseHint')}</DialogDescription>
        </DialogHeader>
        {!preview ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim() && !pending) inspect.mutate();
            }}
          >
            <label className="block space-y-2 text-sm">
              {t('title')}
              <Input
                value={title}
                maxLength={160}
                required
                disabled={pending}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block space-y-2 text-sm">
              {t('importSource')}
              <select
                aria-label={t('importSource')}
                className="block w-full rounded border bg-card p-2"
                value={source}
                disabled={pending}
                onChange={(e) => {
                  setSource(e.target.value as 'cms' | 'file');
                  setFileError(false);
                  inspect.reset();
                }}
              >
                <option value="cms">{t('exocorpseCms')}</option>
                <option value="file">{t('canonicalExport')}</option>
              </select>
            </label>
            {source === 'file' && (
              <label className="block space-y-2 text-sm">
                {t('canonicalExport')}
                <Input
                  type="file"
                  accept="application/json,.json"
                  disabled={pending}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    setPayload(undefined);
                    setFileError(false);
                    if (!file) return;
                    try {
                      if (file.size > 8_000_000) throw new Error();
                      setPayload(JSON.parse(await file.text()));
                    } catch {
                      setFileError(true);
                    }
                  }}
                />
              </label>
            )}
            {fileError && <p role="alert">{t('invalidImportFile')}</p>}
            <Button
              disabled={
                pending || !title.trim() || (source === 'file' && !payload)
              }
            >
              {t(inspect.isPending ? 'loading' : 'reviewImport')}
            </Button>
          </form>
        ) : (
          <section className="space-y-4">
            <h3 className="font-semibold">{preview.title}</h3>
            <p>
              {t('importSummary', {
                count: preview.count,
                blacklistCount: preview.blacklistCount,
                skipped: preview.skipped,
              })}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('importPrivacy')}
            </p>
            <ul className="max-h-60 space-y-2 overflow-y-auto rounded border p-4">
              {preview.entries.map((entry, index) => (
                <li key={index} className="flex justify-between gap-3 text-sm">
                  <span>{entry.title}</span>
                  <span className="text-muted-foreground">
                    {t(`kind${entry.kind}`)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => apply.mutate()}>
                {t(apply.isPending ? 'importing' : 'createImport')}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={reset}>
                {t('back')}
              </Button>
            </div>
          </section>
        )}
        {error && (
          <p role="alert">
            {t(
              error instanceof InternalApiError && error.status === 403
                ? 'importAccessRequired'
                : error instanceof InternalApiError && error.status === 410
                  ? 'importExpired'
                  : 'requestFailed'
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
