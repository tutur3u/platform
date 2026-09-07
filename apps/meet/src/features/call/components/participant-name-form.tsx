'use client';

import { Loader2, UserRound } from '@tuturuuu/icons';
import { updateCurrentUserProfile } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { prepareParticipantName } from '../lib/participant-name';

/** Save identity before opening signaling, so the host sees the saved name. */
export function ParticipantNameForm({
  meetingName,
  leaveHref,
  initialName,
}: {
  meetingName: string;
  leaveHref: string;
  initialName: string;
}) {
  const t = useTranslations('meet.call');
  const router = useRouter();
  const [name, setName] = useState(prepareParticipantName(initialName));
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const busy = saving || refreshing;

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <form
        className="w-full max-w-md space-y-5 rounded-2xl border p-6 shadow-sm"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !name.trim()) return;
          setSaving(true);
          setError(false);
          try {
            await updateCurrentUserProfile({ display_name: name.trim() });
            startTransition(() => router.refresh());
          } catch {
            setError(true);
          } finally {
            setSaving(false);
          }
        }}
      >
        <UserRound aria-hidden="true" className="size-7 text-primary" />
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{meetingName}</p>
          <h1 className="font-semibold text-2xl">{t('name_setup_title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('name_setup_hint')}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="participant-display-name">{t('your_name')}</Label>
          <Input
            autoComplete="name"
            disabled={busy}
            id="participant-display-name"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {t('name_save_failed')}
          </p>
        ) : null}
        <Button
          className="w-full"
          disabled={busy || !name.trim()}
          type="submit"
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {t('save_name_continue')}
        </Button>
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => router.push(leaveHref)}
          type="button"
          variant="ghost"
        >
          {t('leave')}
        </Button>
      </form>
    </main>
  );
}
