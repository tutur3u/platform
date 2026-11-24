'use client';

import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useProfileNameSave } from '../hooks/use-profile-name-save';
import { prepareParticipantName } from '../lib/participant-name';
import { ParticipantNameCheck } from '../components/participant-name-check';
import { PrejoinNameField } from './prejoin-name-field';
import { usePrejoin, usePrejoinInfo } from './prejoin-context';
import { PrejoinStage, type PrejoinPhase } from './prejoin-stage';

/**
 * The pre-join stage for an account with no display name yet. The name is
 * saved to the profile before the room opens its signaling connection, so the
 * host sees the saved name; the preview stays on while it saves.
 */
export function NameSetupPrejoin({
  initialName,
  siteKey,
}: {
  initialName: string;
  /** Turnstile site key for the browser check a refused save asks for. */
  siteKey?: string;
}) {
  const t = useTranslations('meet.call');
  const router = useRouter();
  const capture = usePrejoin();
  const info = usePrejoinInfo();
  const [name, setName] = useState(prepareParticipantName(initialName));
  const [refreshing, startTransition] = useTransition();
  const nameSave = useProfileNameSave({
    siteKey,
    onSaved: () => startTransition(() => router.refresh()),
  });
  const { state, save } = nameSave;
  const saving = state.kind === 'saving' || refreshing;
  const trimmed = name.trim();
  if (!capture || !info) return null;
  const phase: PrejoinPhase = saving
    ? { kind: 'saving', label: t('save_name_continue') }
    : {
        kind: 'ready',
        label: t('save_name_continue'),
        disabled: !trimmed || state.kind === 'verifying',
      };
  return (
    <PrejoinStage
      avatarUrl={info.avatarUrl}
      capture={capture}
      eyebrow={t('name_setup_title')}
      fields={
        <>
          <PrejoinNameField
            disabled={saving}
            hint={t('name_setup_hint')}
            id="prejoin-profile-name"
            label={t('your_name')}
            onChange={setName}
            placeholder={t('lobby_guest_name_placeholder')}
            value={name}
          />
          <div className={state.kind === 'verifying' ? 'space-y-2' : 'sr-only'}>
            {/* Mounted from the start so its text is announced when the check opens. */}
            <p aria-live="polite" className="text-muted-foreground text-sm">
              {state.kind === 'verifying' ? t('name_verify_prompt') : ''}
            </p>
            {state.kind === 'verifying' && siteKey ? (
              <ParticipantNameCheck
                onFailure={nameSave.failVerification}
                onToken={(token) => void save(state.name, token)}
                siteKey={siteKey}
              />
            ) : null}
          </div>
          {state.kind === 'failed' ? (
            <p className="text-destructive text-sm" role="alert">
              {t(
                state.reason === 'verification'
                  ? 'name_verify_failed'
                  : 'name_save_failed'
              )}
            </p>
          ) : null}
        </>
      }
      name={name}
      onSubmit={() => {
        if (!trimmed || saving) return;
        void save(trimmed);
      }}
      phase={phase}
      secondary={
        <Button
          className="w-full"
          disabled={saving}
          onClick={() => {
            // Leaving ends a pending check, so its late result saves nothing.
            nameSave.reset();
            capture.release();
            router.push(info.leaveHref);
          }}
          type="button"
          variant="ghost"
        >
          {t('leave')}
        </Button>
      }
      title={info.meetingName}
    />
  );
}
