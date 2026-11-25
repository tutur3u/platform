'use client';

import { LockKeyhole, NotebookPen, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { PrivateMiraShareControl } from './use-private-mira-share';

function useShareToggle(share: PrivateMiraShareControl) {
  const [failed, setFailed] = useState(false);
  return {
    failed,
    change: async (enabled: boolean) => {
      if (share.pending) return;
      setFailed(false);
      try {
        await share.onChange(enabled);
      } catch {
        setFailed(true);
      }
    },
  };
}

/** The owner's own switch; nobody else can turn it on for them. */
export function MiraPrivateShareRow({
  share,
}: {
  share: PrivateMiraShareControl;
}) {
  const t = useTranslations('meet.call.miraEverywhere.permissions');
  const { failed, change } = useShareToggle(share);
  return (
    <li className="space-y-1">
      <div className="flex min-w-0 items-center gap-2">
        <LockKeyhole
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <span className="flex-1">{t('shareToggle')}</span>
        <Switch
          aria-label={t('shareToggle')}
          checked={share.enabled}
          disabled={share.pending}
          className="shrink-0 motion-reduce:transition-none [&_span]:motion-reduce:transition-none"
          onCheckedChange={(checked) => void change(checked)}
        />
      </div>
      <p className="ps-5.5 text-muted-foreground">{t('privateOwnerOnly')}</p>
      {failed && (
        <p role="alert" className="ps-5.5 text-destructive">
          {t('failed')}
        </p>
      )}
    </li>
  );
}

/** Shown while sharing is on, with a one-tap revoke. */
export function MiraPrivateShareChip({
  share,
}: {
  share: PrivateMiraShareControl;
}) {
  const t = useTranslations('meet.call.miraEverywhere.permissions');
  const { failed, change } = useShareToggle(share);
  if (!share.enabled) return null;
  return (
    <span
      role="status"
      className="flex w-fit min-w-0 max-w-full items-center gap-1 rounded-full border border-dynamic-purple/30 bg-dynamic-purple/10 py-0.5 ps-2 pe-0.5 text-dynamic-purple text-xs"
    >
      <NotebookPen aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{t(failed ? 'failed' : 'chipShared')}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 rounded-full pointer-coarse:size-9 text-dynamic-purple hover:bg-dynamic-purple/15 hover:text-dynamic-purple"
        aria-label={t('stopSharing')}
        disabled={share.pending}
        onClick={() => void change(false)}
      >
        <X aria-hidden className="size-3.5" />
      </Button>
    </span>
  );
}
