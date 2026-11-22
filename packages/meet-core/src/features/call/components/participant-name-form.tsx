'use client';

import { Loader2, UserRound } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useProfileNameSave } from '../hooks/use-profile-name-save';
import { prepareParticipantName } from '../lib/participant-name';
import { ParticipantNameCheck } from './participant-name-check';

/** Save identity before opening signaling, so the host sees the saved name. */
export function ParticipantNameForm({
  meetingName,
  leaveHref,
  initialName,
  siteKey,
}: {
  meetingName: string;
  leaveHref: string;
  initialName: string;
  /** Turnstile site key for the browser check a refused save asks for. */
  siteKey?: string;
}) {
  const t = useTranslations('meet.call');
  const router = useRouter();
  const [name, setName] = useState(prepareParticipantName(initialName));
  const [refreshing, startTransition] = useTransition();
  const nameSave = useProfileNameSave({
    siteKey,
    onSaved: () => startTransition(() => router.refresh()),
  });
  const { state, save } = nameSave;
  const busy = nameSave.busy || refreshing;

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <form
        className="w-full max-w-md space-y-5 rounded-2xl border p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !name.trim()) return;
          void save(name.trim());
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
        <div className={state.kind === 'verifying' ? 'space-y-2' : 'sr-only'}>
          {/* Mounted from the start so its text is announced when the check opens. */}
          <p aria-live="polite" className="text-muted-foreground text-sm">
            {state.kind === 'verifying' ? t('name_verify_prompt') : ''}
          </p>
          {state.kind === 'verifying' && siteKey ? (
            <ParticipantNameCheck
              siteKey={siteKey}
              onToken={(token) => void save(state.name, token)}
              onFailure={nameSave.failVerification}
            />
          ) : null}
        </div>
        {state.kind === 'failed' ? (
          <p role="alert" className="text-destructive text-sm">
            {t(
              state.reason === 'verification'
                ? 'name_verify_failed'
                : 'name_save_failed'
            )}
          </p>
        ) : null}
        <Button
          className="w-full"
          disabled={busy || !name.trim()}
          type="submit"
        >
          {state.kind === 'saving' || refreshing ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {t('save_name_continue')}
        </Button>
        <Button
          className="w-full"
          disabled={state.kind === 'saving' || refreshing}
          onClick={() => {
            // Leaving ends a pending check, so its late result saves nothing.
            nameSave.reset();
            router.push(leaveHref);
          }}
          type="button"
          variant="ghost"
        >
          {t('leave')}
        </Button>
      </form>
    </main>
  );
}
