'use client';

import { useMutation } from '@tanstack/react-query';
import { inviteWorkspaceMembers } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { MAX_WORKSPACE_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { createWorkspaceFromOnboarding } from './actions';
import { SpaceScene } from './onboarding-illustrations';
import { type JoinedWorkspace, SpaceInvites } from './space-invites';
import { SpaceTeamForm } from './space-team-form';
import { InlineAlert } from './welcome-controls';
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

/**
 * One tile of the radio group. The Radix item brings the radio keyboard
 * pattern (one tab stop, arrow keys move and select); the label makes the
 * whole tile the click target.
 */
function ModeOption({
  checked,
  description,
  label,
  value,
}: {
  checked: boolean;
  description: string;
  label: string;
  value: SpaceDraft['mode'];
}) {
  const id = useId();
  return (
    <label
      className={cn(
        'flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-3.5 py-3 text-left transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2 motion-reduce:transition-none',
        checked ? 'border-primary bg-calendar-bg-pink' : 'hover:bg-accent'
      )}
      htmlFor={id}
    >
      {/* 75% of the muted text tone keeps the empty ring at 3:1 or better. */}
      <RadioGroupItem
        className="size-5 border-2 border-muted-foreground/75 shadow-none data-[state=checked]:border-primary focus-visible:ring-0 focus-visible:outline-none"
        id={id}
        value={value}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
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
      <RadioGroup
        aria-label={t('workspace_group')}
        className="gap-2.5"
        onValueChange={(mode) =>
          onChange({ ...draft, mode: mode === 'team' ? 'team' : 'solo' })
        }
        value={draft.mode}
      >
        <ModeOption
          checked={draft.mode === 'solo'}
          description={t('just_me_description')}
          label={t('just_me')}
          value="solo"
        />
        <ModeOption
          checked={draft.mode === 'team'}
          description={t('with_team_description')}
          label={t('with_team')}
          value="team"
        />
      </RadioGroup>
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
