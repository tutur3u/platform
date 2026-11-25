'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

export function GuestAdmissionStage({
  phase,
  name,
  verified,
  fields,
  verification,
  media,
  joinDisabled,
  onJoin,
  onLeave,
}: {
  phase: 'joining' | 'waiting' | 'admitted' | 'confirm';
  name: string;
  verified: boolean;
  fields: ReactNode;
  verification?: ReactNode;
  media: readonly {
    kind: 'microphone' | 'camera';
    enabled: boolean;
    toggle: () => void;
  }[];
  joinDisabled: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const t = useTranslations('meet.call.prejoin');
  const guest = useTranslations('meet.call.guest_join');
  const [editing, setEditing] = useState(false);
  const canEdit = phase === 'confirm' || phase === 'waiting';
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <section className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
        <h1 className="flex items-center gap-2 font-semibold text-lg">
          {phase !== 'confirm' && (
            <Loader2
              aria-hidden
              className="size-4 shrink-0 motion-safe:animate-spin"
            />
          )}
          <span role="status">{t(`guest_${phase}`)}</span>
        </h1>
        {canEdit && (
          <>
            <div className="flex items-start justify-between gap-2 text-sm">
              <p className="min-w-0 break-words text-muted-foreground">
                {t('guest_summary', { name })}
                {verified && <> · {guest('verified')}</>}
              </p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto shrink-0 px-0 py-0"
                aria-expanded={editing}
                onClick={() => setEditing((value) => !value)}
              >
                {t(editing ? 'guest_done' : 'guest_edit')}
              </Button>
            </div>
            {editing && (
              <div className="space-y-3">
                {fields}
                {verified && <p className="text-sm">{guest('verified')}</p>}
              </div>
            )}
          </>
        )}
        {phase === 'confirm' && (
          <>
            {media.map(({ kind, enabled, toggle }) => (
              <label
                key={kind}
                className="flex min-h-8 items-center justify-between gap-3 text-sm"
              >
                {t(`guest_${kind}`)}
                <Switch checked={enabled} onCheckedChange={toggle} />
              </label>
            ))}
            <Button
              type="button"
              className="w-full"
              disabled={joinDisabled}
              onClick={onJoin}
            >
              {t('guest_join')}
            </Button>
          </>
        )}
        {phase === 'waiting' && (
          <>
            {verification}
            <Button type="button" variant="outline" onClick={onLeave}>
              {t('back')}
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
