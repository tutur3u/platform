import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import {
  isTutoringGroupExcluded,
  type TutoringPolicy,
  tutoringExclusionReason,
} from '@tuturuuu/internal-api/tutoring-policy';
import {
  buildShiftRuleSessions,
  suggestTutoringSlots,
} from '@tuturuuu/internal-api/tutoring-suggestion';
import type { TutoringFormValues } from './tutoring-types';

/** Calendar date of a class in its own time zone (center default if unset). */
export function localClassDate(session: WorkspaceUserGroupSession) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone: session.startTimezone || 'Asia/Ho_Chi_Minh',
      year: 'numeric',
    }).format(new Date(session.startsAt));
  } catch {
    return null;
  }
}

export type TutoringSuggestionMessage =
  | { key: 'smart_suggestion_applied'; values: { count: number } }
  | { key: 'suggestion_partial'; values: { found: number; total: number } }
  | { key: 'suggestion_unmatched'; values: { count: number } }
  | { key: 'suggestion_excluded'; values: Record<string, never> }
  | { key: 'suggestion_unavailable'; values: { days: number } };

/**
 * The group calendar, or the assigned shift's implied classes when the
 * calendar has nothing scheduled in the window. A class the workspace
 * excludes from tutoring implies none.
 */
export function resolveTutoringClassSchedule({
  calendar,
  groupId,
  groupName,
  loaded,
  policy,
  reasonType,
  today,
}: {
  calendar: WorkspaceUserGroupSession[];
  groupId: string;
  groupName?: string | null;
  loaded: boolean;
  policy: TutoringPolicy;
  reasonType?: string;
  today: string;
}) {
  if (!loaded || calendar.some((session) => session.status === 'scheduled'))
    return calendar;
  return buildShiftRuleSessions({
    days: policy.schedulingHorizonDays,
    fromDate: today,
    groupId,
    groupName,
    policy,
    reason: tutoringExclusionReason(reasonType),
  });
}

/** Whether the workspace excludes this class from the form's kind of tutoring. */
export function isTutoringFormGroupExcluded({
  form,
  groupName,
  policy,
}: {
  form: Pick<TutoringFormValues, 'groupId' | 'reasonType'>;
  groupName?: string | null;
  policy: TutoringPolicy;
}) {
  return (
    Boolean(form.groupId) &&
    isTutoringGroupExcluded(
      policy,
      groupName ?? '',
      tutoringExclusionReason(form.reasonType),
      form.groupId
    )
  );
}

/** Fill as many slots as the schedule supports; never discard a partial plan. */
export function applyTutoringSuggestions({
  form,
  fromDate,
  groupName,
  policy,
  schedule,
}: {
  form: TutoringFormValues;
  fromDate: string;
  groupName?: string | null;
  policy: TutoringPolicy;
  schedule: WorkspaceUserGroupSession[];
}): { form: TutoringFormValues | null; message: TutoringSuggestionMessage } {
  if (isTutoringFormGroupExcluded({ form, groupName, policy }))
    return { form: null, message: { key: 'suggestion_excluded', values: {} } };
  const total = form.sessionSlots.length;
  const suggestions = suggestTutoringSlots(
    schedule,
    fromDate,
    total,
    policy,
    form.reasonType === 'WEAK_SUPPORT' ? 'consecutive' : 'separate',
    new Date(),
    { groupName, reason: tutoringExclusionReason(form.reasonType) }
  );
  if (!suggestions.length) {
    const upcoming = schedule.filter(
      (session) =>
        session.status === 'scheduled' &&
        (localClassDate(session) ?? '') > fromDate
    ).length;
    return {
      form: null,
      message: upcoming
        ? { key: 'suggestion_unmatched', values: { count: upcoming } }
        : {
            key: 'suggestion_unavailable',
            values: { days: policy.schedulingHorizonDays },
          },
    };
  }
  return {
    form: {
      ...form,
      sessionSlots: form.sessionSlots.map((slot, index) => {
        const suggestion = suggestions[index];
        return suggestion
          ? {
              ...slot,
              durationMinutes:
                suggestion.durationMinutes ?? policy.durationMinutes,
              sessionDate: suggestion.sessionDate,
              startTime: suggestion.startTime,
            }
          : slot;
      }),
    },
    message:
      suggestions.length < total
        ? {
            key: 'suggestion_partial',
            values: { found: suggestions.length, total },
          }
        : {
            key: 'smart_suggestion_applied',
            values: { count: suggestions.length },
          },
  };
}
