'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
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
  activity_answer_changed: 'answer_changed',
  activity_game_running: 'game_running',
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

/** The room's refusal of this person's last action, said quietly in place. */
export function ActivityNotice({ error }: { error: string | null }) {
  const t = useTranslations('meet.call.live_activities.errors');
  if (!error) return null;
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {t(ERRORS[error] ?? 'generic')}
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

/** An option the room can pick, shown as one full-width choice. */
export function ChoiceButton({
  selected,
  correct,
  disabled,
  onSelect,
  children,
}: {
  selected: boolean;
  /** Set once the answer is known: marks the right option for everyone. */
  correct?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled || !onSelect}
      onClick={onSelect}
      className={cn(
        'flex min-h-11 w-full items-center gap-2 rounded-full border px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        'enabled:hover:bg-accent disabled:cursor-default',
        selected && 'border-foreground bg-accent font-semibold',
        correct && 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
      )}
    >
      <span className="min-w-0 flex-1 wrap-break-word">{children}</span>
    </button>
  );
}

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
            placeholder={t('option', { number: index + 1 })}
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
