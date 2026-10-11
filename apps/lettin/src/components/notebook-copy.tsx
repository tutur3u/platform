'use client';
import type { LettinRole } from '@tuturuuu/internal-api/lettin';
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
import { Link } from '@/i18n/navigation';
import { NotebookImportReview } from './notebook-import-review';
import { useNotebookCopy } from './use-notebook-copy';

type CopyProps = {
  wsId: string;
  worldId: string;
  worldRole: LettinRole;
  sourceVersion: number;
  sourceTitle: string;
  disabled: boolean;
};
export function NotebookCopy(props: CopyProps) {
  const actor = useWorkspaceActor();
  if (props.worldRole !== 'owner') return null;
  return (
    <NotebookCopyControls
      key={`${props.wsId}:${props.worldId}:${props.sourceVersion}:${actor?.actorId ?? ''}:${props.disabled}`}
      {...props}
      actor={actor}
    />
  );
}
function NotebookCopyControls(
  props: CopyProps & { actor: ReturnType<typeof useWorkspaceActor> }
) {
  const t = useTranslations('lettin');
  const copy = useNotebookCopy({
    ...props,
    initialTitle: t('notebookCopyDefaultTitle', { title: props.sourceTitle }),
  });
  return (
    <Dialog open={copy.open} onOpenChange={copy.setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!props.actor || props.disabled}>
          {t('copyNotebook')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('copyNotebook')}</DialogTitle>
          <DialogDescription>{t('notebookCopyHint')}</DialogDescription>
        </DialogHeader>
        {copy.created ? (
          <section className="space-y-3">
            <p role="status">{t('notebookCopyCreated')}</p>
            <Link href={`/${props.wsId}/wiki/${copy.created}/overview`}>
              {t('openNotebookCopy')}
            </Link>
          </section>
        ) : copy.preview ? (
          <NotebookImportReview
            preview={copy.preview}
            pending={copy.pending || !copy.allowed}
            onApply={() => void copy.submit()}
            onBack={copy.back}
          />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void copy.submit();
            }}
          >
            <label className="block space-y-2 text-sm">
              {t('title')}
              <Input
                value={copy.title}
                maxLength={160}
                required
                disabled={copy.pending}
                onChange={(event) => copy.setTitle(event.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={copy.consent}
                disabled={copy.pending}
                onChange={(event) => copy.setConsent(event.target.checked)}
              />
              {t('notebookCopyConsent')}
            </label>
            <Button disabled={!copy.allowed || copy.pending}>
              {t('reviewNotebookCopy')}
            </Button>
          </form>
        )}
        {copy.error && <p role="alert">{t(copy.error)}</p>}
      </DialogContent>
    </Dialog>
  );
}
