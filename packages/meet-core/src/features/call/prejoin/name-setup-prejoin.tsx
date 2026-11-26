'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState, useTransition } from 'react';
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
  const defaultName = prepareParticipantName(initialName);
  const [name, setName] = useState(defaultName);
  const nameInput = useRef<HTMLInputElement | null>(null);
  const attachNameInput = useCallback((input: HTMLInputElement | null) => {
    nameInput.current = input;
    // Hydration can attach after the browser has already filled this field.
    if (input) setName(input.value);
  }, []);
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
      fields={
        <>
          <PrejoinNameField
            defaultValue={defaultName}
            disabled={saving}
            id="prejoin-profile-name"
            inputRef={attachNameInput}
            label={t('your_name')}
            onChange={setName}
            placeholder={t('lobby_guest_name_placeholder')}
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
      back={
        saving
          ? undefined
          : {
              label: t('prejoin.back'),
              onClick: () => {
                // Leaving ends a pending check, so its late result saves nothing.
                nameSave.reset();
                capture.release();
                router.push(info.leaveHref);
              },
            }
      }
      name={name}
      onSubmit={() => {
        const currentName = prepareParticipantName(
          nameInput.current?.value ?? name
        );
        if (!currentName || saving) return;
        void save(currentName);
      }}
      phase={phase}
      title={info.meetingName}
    />
  );
}
