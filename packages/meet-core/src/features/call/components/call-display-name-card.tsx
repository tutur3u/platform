'use client';

import { Loader2, UserRound } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type LiveRenameState,
  useLiveDisplayName,
} from '../hooks/use-live-display-name';
import type { NameSaveState } from '../hooks/use-profile-name-save';
import { prepareParticipantName } from '../lib/participant-name';
import type { MeetRoomController } from '../lib/room-controller';
import { MeetSettingsCard, MeetSettingsHeading } from './meet-settings-card';
import { ParticipantNameCheck } from './participant-name-check';

/**
 * The display name others see. Saving updates the account profile through
 * Web (answering its browser check when asked), then renames this
 * participant for everyone in the call without a rejoin.
 */
export function CallDisplayNameCard({
  room,
  savedName,
  avatarUrl,
  siteKey,
  onProfileSaved,
}: {
  room: Pick<MeetRoomController, 'previewDisplayName' | 'renameSelf' | 'state'>;
  /** The profile name, or the room name until the profile loads. */
  savedName: string;
  avatarUrl?: string | null;
  siteKey?: string;
  onProfileSaved?: (name: string) => void;
}) {
  const t = useTranslations('meet.call');
  const accountT = useTranslations('settings-account');
  const commonT = useTranslations('common');
  const [draft, setDraft] = useState<string | null>(null);
  // The profile query refetches after a save; until then the saved name wins.
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const saved = justSaved ?? savedName;
  const value = draft ?? saved;
  const name = prepareParticipantName(value);
  const rename = useLiveDisplayName({
    room,
    siteKey,
    onProfileSaved: (next) => {
      setJustSaved(next);
      setDraft(null);
      onProfileSaved?.(next);
    },
  });
  const { state } = rename.save;
  const dirty = name !== prepareParticipantName(saved);
  const shown = name || saved;

  return (
    <MeetSettingsCard aria-labelledby="meet-display-name-title">
      <MeetSettingsHeading
        id="meet-display-name-title"
        icon={<UserRound className="size-4" />}
        title={accountT('display-name')}
        description={t('profile_settings.name_hint')}
      />
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) rename.submit(value);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="meet-display-name" className="sr-only">
            {accountT('display-name')}
          </Label>
          <Input
            id="meet-display-name"
            autoComplete="name"
            disabled={rename.busy}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder={t('profile_settings.name_placeholder')}
            value={value}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <div
          aria-label={t('profile_settings.preview')}
          className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/50 px-3 py-2"
          role="group"
        >
          <Avatar className="size-8 shrink-0">
            <AvatarImage alt="" src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">
              {getInitials(shown)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0">
            <span className="text-muted-foreground text-xs">
              {t('profile_settings.preview')}
            </span>
            <span className="truncate font-medium text-sm">{shown}</span>
          </div>
        </div>
        <SaveStatus
          state={state}
          live={rename.live}
          siteKey={siteKey}
          onToken={(token) => {
            if (state.kind === 'verifying')
              void rename.save.save(state.name, token);
          }}
          onCheckFailed={rename.save.failVerification}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty && state.kind !== 'verifying'}
            onClick={() => {
              setDraft(null);
              rename.clearStatus();
            }}
          >
            {commonT('reset')}
          </Button>
          <Button type="submit" disabled={!dirty || !name || rename.busy}>
            {rename.busy && state.kind !== 'verifying' ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {commonT('save')}
          </Button>
        </div>
      </form>
    </MeetSettingsCard>
  );
}

function SaveStatus({
  state,
  live,
  siteKey,
  onToken,
  onCheckFailed,
}: {
  state: NameSaveState;
  live: LiveRenameState;
  siteKey?: string;
  onToken: (token: string) => void;
  onCheckFailed: () => void;
}) {
  const t = useTranslations('meet.call');
  const message = (() => {
    if (state.kind === 'failed')
      return state.reason === 'verification'
        ? t('name_verify_failed')
        : t('name_save_failed');
    if (state.kind === 'verifying') return t('name_verify_prompt');
    switch (live.kind) {
      case 'renamed':
        return t('profile_settings.renamed');
      case 'locked':
        return t('profile_settings.locked');
      case 'unconfirmed':
        return t('profile_settings.unconfirmed');
      case 'idle':
      case 'renaming':
        return '';
      default: {
        const unreachable: never = live;
        return unreachable;
      }
    }
  })();
  return (
    <div className={message ? 'grid gap-2' : 'sr-only'}>
      {/* Mounted from the start so each outcome is announced. */}
      <p
        aria-live="polite"
        role={state.kind === 'failed' ? 'alert' : undefined}
        className={
          state.kind === 'failed'
            ? 'text-destructive text-sm'
            : 'text-muted-foreground text-sm'
        }
      >
        {message}
      </p>
      {state.kind === 'verifying' && siteKey ? (
        <ParticipantNameCheck
          siteKey={siteKey}
          onToken={onToken}
          onFailure={onCheckFailed}
        />
      ) : null}
    </div>
  );
}
