'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  applyLettinNotebookImport,
  type LettinImportPreview,
  previewLettinNotebookImport,
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
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { NotebookImportReview } from './notebook-import-review';
export function NotebookImport({ wsId }: { wsId: string }) {
  const t = useTranslations('lettin'),
    actor = useWorkspaceActor(),
    client = useQueryClient(),
    router = useRouter();
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(''),
    [payload, setPayload] = useState<unknown>(),
    [consent, setConsent] = useState(false),
    [preview, setPreview] = useState<LettinImportPreview>(),
    [error, setError] = useState('');
  const lease = useRef(0),
    busy = useRef(false);
  useEffect(
    () => () => {
      lease.current++;
    },
    []
  );
  const inspect = useMutation({
    mutationFn: () =>
      previewLettinNotebookImport(wsId, {
        title,
        payload,
        consent: true,
        expectedActor: actor!.actorId,
      }),
    retry: false,
  });
  const apply = useMutation({
    mutationFn: () =>
      applyLettinNotebookImport(wsId, {
        previewId: preview!.id,
        consent: true,
        expectedActor: actor!.actorId,
      }),
    retry: false,
  });
  const pending = inspect.isPending || apply.isPending;
  const reset = () => {
    lease.current++;
    setTitle('');
    setPayload(undefined);
    setConsent(false);
    setPreview(undefined);
    setError('');
  };
  async function submit() {
    if (!actor || busy.current || !consent || !title.trim() || !payload) return;
    const epoch = lease.current;
    busy.current = true;
    setError('');
    try {
      actor.assertActive();
      if (!preview) {
        const result = await inspect.mutateAsync();
        actor.assertActive();
        if (lease.current === epoch) setPreview(result);
      } else {
        const result = await apply.mutateAsync();
        actor.assertActive();
        if (lease.current !== epoch) return;
        await client.invalidateQueries({ queryKey: ['lettin', wsId] });
        actor.assertActive();
        if (lease.current !== epoch) return;
        setOpen(false);
        reset();
        router.push(`/${wsId}/wiki/${result.id}/overview`);
      }
    } catch (failure) {
      if (lease.current === epoch)
        setError(
          failure instanceof InternalApiError && failure.status === 410
            ? 'importExpired'
            : 'requestFailed'
        );
    } finally {
      busy.current = false;
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!actor}>
          {t('importNotebook')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('importNotebook')}</DialogTitle>
          <DialogDescription>{t('importNotebookHint')}</DialogDescription>
        </DialogHeader>
        {!preview ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="block space-y-2 text-sm">
              {t('title')}
              <Input
                value={title}
                maxLength={160}
                required
                disabled={pending}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block space-y-2 text-sm">
              {t('notebookJsonFile')}
              <Input
                type="file"
                accept="application/json,.json"
                disabled={pending}
                onChange={async (event) => {
                  const file = event.target.files?.[0],
                    epoch = ++lease.current;
                  setPayload(undefined);
                  setConsent(false);
                  setError('');
                  if (!file) return;
                  try {
                    if (file.size > 10 * 1024 * 1024) throw new Error();
                    const value: unknown = JSON.parse(await file.text());
                    if (lease.current === epoch) setPayload(value);
                  } catch {
                    if (lease.current === epoch) setError('invalidImportFile');
                  }
                }}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consent}
                disabled={pending}
                onChange={(event) => setConsent(event.target.checked)}
              />
              {t('notebookImportConsent')}
            </label>
            <Button
              disabled={
                pending || !actor || !title.trim() || !payload || !consent
              }
            >
              {t('reviewImport')}
            </Button>
          </form>
        ) : (
          <NotebookImportReview
            preview={preview}
            pending={pending || !actor}
            onApply={() => void submit()}
            onBack={() => {
              lease.current++;
              setPreview(undefined);
              setError('');
            }}
          />
        )}
        {error && <p role="alert">{t(error)}</p>}
      </DialogContent>
    </Dialog>
  );
}
