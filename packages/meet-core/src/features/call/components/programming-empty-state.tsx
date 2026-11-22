'use client';
import { CodeXml, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

/** What the panel shows before a resource opens: one action for hosts, a waiting note for everyone else. */
export function ProgrammingEmptyState({
  canManage,
  waiting,
  onOpen,
}: {
  canManage: boolean;
  /** The room is still preparing or reading the current selection. */
  waiting: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('programmingPlayground');
  return (
    <div className="m-auto flex w-full max-w-sm flex-col items-center gap-3 rounded-[var(--radius-2xl)] border bg-card px-6 py-8 text-center">
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        {waiting ? (
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
        ) : (
          <CodeXml className="size-5" />
        )}
      </span>
      <div className="grid gap-1">
        <p className="font-semibold">{t('coding')}</p>
        <p role="status" className="text-muted-foreground text-sm">
          {waiting
            ? t('connecting')
            : t(canManage ? 'emptyHint' : 'chooseResource')}
        </p>
      </div>
      {canManage && !waiting && (
        <Button className="rounded-full" onClick={onOpen}>
          {t('openTitle')}
        </Button>
      )}
    </div>
  );
}
