'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMeetTool } from '../context';
import { ToolAction, ToolIconAction } from '../tool-ui';
import { useLiveActivities } from './activities-store';

const ERRORS: Record<string, string> = {
  activity_rate_limited: 'rate_limited',
  activity_read_rate_limited: 'rate_limited',
  activity_full: 'full',
  permission_denied: 'permission',
  awaiting_admission: 'permission',
  activity_assessment_closed: 'closed',
  activity_game_closed: 'closed',
  activity_assessment_not_closed: 'not_closed',
  activity_assessment_changed: 'assessment_changed',
  activity_assessment_sealed: 'assessment_changed',
  activity_answer_changed: 'answer_changed',
  activity_response_not_found: 'answer_changed',
  activity_game_running: 'game_running',
  activity_icebreaker_prompt_changed: 'prompt_changed',
  activity_icebreaker_unavailable: 'prompt_changed',
  activity_offline: 'reconnecting',
  activity_read_timeout: 'reconnecting',
  malformed_event: 'outdated',
  activity_card_changed: 'card_changed',
  activity_round_changed: 'round_changed',
};

/**
 * One room-shared activity for the person looking at it: the room's state,
 * their own answers, the manager view for hosts and co-hosts, and names for
 * the room ids the server records.
 */
export function useActivity() {
  const tool = useMeetTool();
  const activities = useLiveActivities(tool.meetingId);
  const t = useTranslations('meet.call.live_activities');
  const nameOf = (participantId: string) =>
    participantId === tool.selfUserId
      ? t('you')
      : tool.people?.[participantId]?.displayName?.trim() || t('someone');
  return {
    ...activities,
    // The room's rule for live activities, which also covers workspace co-hosts.
    canManage: tool.canRunActivities ?? tool.canManage,
    selfUserId: tool.selfUserId ?? null,
    nameOf,
  };
}

export type Activity = ReturnType<typeof useActivity>;

/**
 * The room's refusal of this person's last action, said quietly in place.
 * While the state on screen waits for the room to confirm it after a
 * reconnect, the line says so, because nothing can be sent until then.
 */
export function ActivityNotice({
  error,
  stale,
}: {
  error: string | null;
  stale: boolean;
}) {
  const t = useTranslations('meet.call.live_activities.errors');
  if (!error && !stale) return null;
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {t(error ? (ERRORS[error] ?? 'generic') : 'reconnecting')}
    </p>
  );
}

export function ActivityEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
      {children}
    </p>
  );
}

export function ActivitySection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 font-semibold text-sm">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export const activityCardClass = 'space-y-3 rounded-2xl border bg-card p-3';

/** Two to six options with one marked as the answer, for choices and rounds. */
export function OptionsEditor({
  options,
  answer,
  onChange,
  name,
}: {
  options: string[];
  answer: number | undefined;
  onChange: (options: string[], answer: number | undefined) => void;
  /** Radio group name; unique per item so groups stay independent. */
  name: string;
}) {
  const t = useTranslations('meet.call.live_activities.options');
  return (
    <fieldset className="space-y-2">
      <legend className="pb-1 font-medium text-muted-foreground text-xs">
        {t('legend')}
      </legend>
      {options.map((option, index) => (
        // Options have no identity of their own; their position is the answer key.
        <div key={index} className="flex items-center gap-2">
          {/* The label widens the radio's touch target to the full control height. */}
          <label className="grid size-8 pointer-coarse:size-11 shrink-0 cursor-pointer place-items-center">
            <input
              type="radio"
              name={name}
              className="size-4 accent-primary"
              aria-label={t('mark_correct', { number: index + 1 })}
              checked={answer === index}
              onChange={() => onChange(options, index)}
            />
          </label>
          <Input
            value={option}
            maxLength={120}
            aria-label={t('option', { number: index + 1 })}
            placeholder={t('placeholder')}
            onChange={(event) =>
              onChange(
                options.map((value, position) =>
                  position === index ? event.target.value : value
                ),
                answer
              )
            }
          />
          <ToolIconAction
            icon={Trash2}
            label={t('remove', { number: index + 1 })}
            disabled={options.length <= 2}
            onClick={() =>
              onChange(
                options.filter((_, position) => position !== index),
                answer === undefined || answer === index
                  ? undefined
                  : answer > index
                    ? answer - 1
                    : answer
              )
            }
          />
        </div>
      ))}
      <ToolAction
        icon={Plus}
        label={t('add')}
        variant="ghost"
        disabled={options.length >= 6}
        onClick={() => onChange([...options, ''], answer)}
      />
    </fieldset>
  );
}
