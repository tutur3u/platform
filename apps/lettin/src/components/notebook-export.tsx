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
import { copyNotebookToDrive, notebookExportBlob } from './notebook-drive-copy';

type ExportProps = {
  wsId: string;
  worldId: string;
  worldRole: LettinRole;
  published: boolean;
  disabled: boolean;
};
export function NotebookExport(props: ExportProps) {
  const actor = useWorkspaceActor();
  return (
    <NotebookExportControls
      key={`${props.wsId}:${props.worldId}:${actor?.actorId ?? ''}`}
      {...props}
      actor={actor}
    />
  );
}
function NotebookExportControls({
  wsId,
  worldId,
  worldRole,
  published,
  disabled,
  actor,
}: ExportProps & { actor: ReturnType<typeof useWorkspaceActor> }) {
  const t = useTranslations('lettin');
  const [destination, setDestination] = useState<'download' | 'drive'>(
    'download'
  );
  const [driveConsent, setDriveConsent] = useState(false);
  const [driveStatus, setDriveStatus] = useState<
    'saved' | 'partial' | 'uncertain' | null
  >(null);
  const [busy, setBusy] = useState(false);
  const current = useRef({ disabled, worldRole, published });
  current.current = { disabled, worldRole, published };
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
    (scope === 'published' ? published : worldRole === 'owner' && consent) &&
    (destination === 'download' || driveConsent);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        lease.current += 1;
        setOpen(value);
        setScope('published');
        setConsent(false);
        setFailed(false);
        setDestination('download');
        setDriveConsent(false);
        setDriveStatus(null);
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
            disabled={mutation.isPending || busy}
            onChange={(e) => {
              setScope(e.target.value as 'published' | 'draft');
              setConsent(false);
              setDriveConsent(false);
              setDriveStatus(null);
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
              disabled={mutation.isPending || busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t('exportPrivateConsent')}
          </label>
        )}
        {!published && scope === 'published' && (
          <p>{t('exportNotPublished')}</p>
        )}
        <label className="block space-y-2 text-sm">
          {t('exportDestination')}
          <select
            value={destination}
            disabled={mutation.isPending || busy}
            className="block w-full rounded border border-input bg-card p-2"
            onChange={(event) => {
              setDestination(
                event.target.value === 'drive' ? 'drive' : 'download'
              );
              setDriveConsent(false);
              setDriveStatus(null);
              setFailed(false);
            }}
          >
            <option value="download">{t('exportDownloadDestination')}</option>
            <option value="drive">{t('exportDriveDestination')}</option>
          </select>
        </label>
        {destination === 'drive' && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={driveConsent}
              disabled={mutation.isPending || busy}
              onChange={(event) => setDriveConsent(event.target.checked)}
            />
            {t('exportDriveConsent')}
          </label>
        )}
        <Button
          disabled={!allowed || mutation.isPending || busy}
          onClick={async () => {
            if (!allowed || submitting.current || !actor) return;
            const epoch = lease.current;
            submitting.current = true;
            setBusy(true);
            setDriveStatus(null);
            let driveStarted = false;
            const assertCurrent = () => {
              actor.assertActive();
              if (
                lease.current !== epoch ||
                current.current.disabled ||
                (scope === 'published' && !current.current.published) ||
                (scope === 'draft' && current.current.worldRole !== 'owner')
              )
                throw new Error('Export context changed');
            };
            setFailed(false);
            try {
              assertCurrent();
              const result = await mutation.mutateAsync();
              assertCurrent();
              const blob = notebookExportBlob(result);
              if (destination === 'drive') {
                driveStarted = true;
                const copied = await copyNotebookToDrive(
                  wsId,
                  blob,
                  assertCurrent
                );
                assertCurrent();
                setDriveConsent(false);
                setDriveStatus(
                  copied.finalize?.success === true ? 'saved' : 'partial'
                );
                return;
              }
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
              if (lease.current === epoch) {
                setFailed(true);
                if (destination === 'drive') {
                  setDriveConsent(false);
                  if (driveStarted) setDriveStatus('uncertain');
                }
              }
            } finally {
              submitting.current = false;
              setBusy(false);
            }
          }}
        >
          {t(
            destination === 'drive'
              ? 'copyNotebookToDrive'
              : 'downloadNotebookJson'
          )}
        </Button>
        {driveStatus && (
          <p role={driveStatus === 'saved' ? 'status' : 'alert'}>
            {t(`exportDrive_${driveStatus}`)}
          </p>
        )}
        {failed && !driveStatus && <p role="alert">{t('requestFailed')}</p>}
      </DialogContent>
    </Dialog>
  );
}
