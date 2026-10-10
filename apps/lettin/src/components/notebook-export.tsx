'use client';
import { useMutation } from '@tanstack/react-query';
import {
  exportLettinNotebook,
  type LettinRole,
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
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
export function NotebookExport({
  wsId,
  worldId,
  worldRole,
  published,
  disabled,
}: {
  wsId: string;
  worldId: string;
  worldRole: LettinRole;
  published: boolean;
  disabled: boolean;
}) {
  const t = useTranslations('lettin'),
    actor = useWorkspaceActor();
  const [open, setOpen] = useState(false),
    [scope, setScope] = useState<'published' | 'draft'>('published'),
    [consent, setConsent] = useState(false);
  const [failed, setFailed] = useState(false);
  const lease = useRef(0),
    submitting = useRef(false);
  useEffect(
    () => () => {
      lease.current += 1;
    },
    []
  );
  const mutation = useMutation({
    mutationFn: () =>
      exportLettinNotebook(wsId, {
        worldId,
        scope,
        privateConsent: consent,
        expectedActor: actor!.actorId,
      }),
    retry: false,
  });
  const allowed =
    !!actor &&
    !disabled &&
    (scope === 'published' ? published : worldRole === 'owner' && consent);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        lease.current += 1;
        setOpen(value);
        setScope('published');
        setConsent(false);
        setFailed(false);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled || !actor}>
          {t('exportNotebook')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('exportNotebook')}</DialogTitle>
          <DialogDescription>{t('exportNotebookHint')}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-2 text-sm">
          {t('exportScope')}
          <select
            className="block w-full rounded border border-input bg-card p-2"
            value={scope}
            disabled={mutation.isPending}
            onChange={(e) => {
              setScope(e.target.value as 'published' | 'draft');
              setConsent(false);
            }}
          >
            <option value="published">{t('exportPublished')}</option>
            <option value="draft" disabled={worldRole !== 'owner'}>
              {t('exportSavedDrafts')}
            </option>
          </select>
        </label>
        {scope === 'draft' && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              disabled={mutation.isPending}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t('exportPrivateConsent')}
          </label>
        )}
        {!published && scope === 'published' && (
          <p>{t('exportNotPublished')}</p>
        )}
        <Button
          disabled={!allowed || mutation.isPending}
          onClick={async () => {
            if (!allowed || submitting.current || !actor) return;
            const epoch = lease.current;
            submitting.current = true;
            setFailed(false);
            try {
              actor.assertActive();
              const result = await mutation.mutateAsync();
              actor.assertActive();
              if (lease.current !== epoch) return;
              const blob = new Blob([JSON.stringify(result)], {
                type: 'application/json',
              });
              if (blob.size > 10 * 1024 * 1024)
                throw new Error('Export too large');
              const url = URL.createObjectURL(blob),
                link = document.createElement('a');
              try {
                link.href = url;
                link.download = 'lettin-notebook.json';
                document.body.append(link);
                link.click();
              } finally {
                link.remove();
                URL.revokeObjectURL(url);
              }
            } catch {
              if (lease.current === epoch) setFailed(true);
            } finally {
              submitting.current = false;
            }
          }}
        >
          {t('downloadNotebookJson')}
        </Button>
        {failed && <p role="alert">{t('requestFailed')}</p>}
      </DialogContent>
    </Dialog>
  );
}
