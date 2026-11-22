'use client';

import { useMutation } from '@tanstack/react-query';
import { inviteWorkspaceMembers } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { MAX_WORKSPACE_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createWorkspaceFromOnboarding } from './actions';
import { SpaceScene } from './onboarding-illustrations';
import { type JoinedWorkspace, SpaceInvites } from './space-invites';
import { SpaceTeamForm } from './space-team-form';
import { FOCUS_RING, InlineAlert } from './welcome-controls';
import { WORKSPACE_LIMIT_CODE } from './welcome-model';
import { StepHeading } from './welcome-shell';

export type SpaceDraft = {
  emails: string[];
  mode: 'solo' | 'team';
  name: string;
};

class SpaceError extends Error {
  constructor(
    readonly key:
      | 'create_error'
      | 'invites_failed'
      | 'limit_reached'
      | 'name_required'
  ) {
    super(key);
  }
}

function ModeOption({
  checked,
  description,
  label,
  onSelect,
}: {
  checked: boolean;
  description: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        FOCUS_RING,
        'flex w-full items-center gap-3.5 rounded-2xl border px-3.5 py-3 text-left transition-colors motion-reduce:transition-none',
        checked ? 'border-primary bg-calendar-bg-pink' : 'hover:bg-accent'
      )}
      onClick={onSelect}
      role="radio"
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
          checked ? 'border-primary bg-primary' : 'border-input'
        )}
      >
        {checked ? <span className="size-1.5 rounded-full bg-card" /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </button>
  );
}

export function StepSpace({
  created,
  draft,
  onAdvance,
  onChange,
  onCreated,
  onJoined,
}: {
  /** The team workspace made here; a retry never creates a second one. */
  created: JoinedWorkspace | null;
  draft: SpaceDraft;
  /** Saves the position and moves on; rejects when the save fails. */
  onAdvance: (teamWorkspaceId?: string) => Promise<void>;
  onChange: (draft: SpaceDraft) => void;
  onCreated: (workspace: JoinedWorkspace) => void;
  onJoined: (workspace: JoinedWorkspace) => void;
}) {
  const t = useTranslations('onboarding_flow');
  const [error, setError] = useState<string | null>(null);
  const [invitesFailed, setInvitesFailed] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      if (draft.mode === 'solo') return onAdvance();
      // The workspace exists and the person saw the invite note: move on.
      if (created && invitesFailed) return onAdvance(created.id);

      let target = created;
      if (!target) {
        const name = draft.name.trim();
        if (!name || name.length > MAX_WORKSPACE_NAME_LENGTH) {
          throw new SpaceError('name_required');
        }
        const result = await createWorkspaceFromOnboarding(name);
        if (!result.success || !result.workspaceId) {
          throw new SpaceError(
            result.errorCode === WORKSPACE_LIMIT_CODE
              ? 'limit_reached'
              : 'create_error'
          );
        }
        target = { id: result.workspaceId, name };
        onCreated(target);
      }

      if (draft.emails.length > 0) {
        const sent = await inviteWorkspaceMembers(
          target.id,
          draft.emails
        ).catch(() => null);
        if (!sent || sent.successCount < draft.emails.length) {
          setInvitesFailed(true);
          throw new SpaceError('invites_failed');
        }
      }
      await onAdvance(target.id);
    },
    onError: (failure) =>
      setError(t(failure instanceof SpaceError ? failure.key : 'create_error')),
    onSuccess: () => setError(null),
  });

  return (
    <>
      <StepHeading
        scene={<SpaceScene className="w-[96px] sm:w-[110px]" />}
        subtitle={t('space_subtitle')}
        title={t('space_title')}
      />
      <SpaceInvites onJoined={onJoined} />
      <div
        aria-label={t('workspace_group')}
        className="flex flex-col gap-2.5"
        role="radiogroup"
      >
        <ModeOption
          checked={draft.mode === 'solo'}
          description={t('just_me_description')}
          label={t('just_me')}
          onSelect={() => onChange({ ...draft, mode: 'solo' })}
        />
        <ModeOption
          checked={draft.mode === 'team'}
          description={t('with_team_description')}
          label={t('with_team')}
          onSelect={() => onChange({ ...draft, mode: 'team' })}
        />
      </div>
      {draft.mode === 'team' ? (
        <SpaceTeamForm
          emails={draft.emails}
          name={draft.name}
          onEmailsChange={(emails) => onChange({ ...draft, emails })}
          onNameChange={(name) => onChange({ ...draft, name })}
        />
      ) : null}
      <InlineAlert message={error} />
      <div className="flex justify-end">
        <Button
          className="h-11 min-w-36 rounded-full"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          type="button"
        >
          {save.isPending
            ? draft.mode === 'team' && !created
              ? t('creating')
              : t('saving')
            : t('continue')}
        </Button>
      </div>
    </>
  );
}
