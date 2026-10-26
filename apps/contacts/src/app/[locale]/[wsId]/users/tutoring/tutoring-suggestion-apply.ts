import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import type { TutoringPolicy } from '@tuturuuu/internal-api/tutoring-policy';
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
  | { key: 'suggestion_unavailable'; values: { days: number } };

/**
 * The group calendar, or the assigned shift's implied classes when the
 * calendar has nothing scheduled in the window.
 */
export function resolveTutoringClassSchedule({
  calendar,
  groupId,
  loaded,
  policy,
  today,
}: {
  calendar: WorkspaceUserGroupSession[];
  groupId: string;
  loaded: boolean;
  policy: TutoringPolicy;
  today: string;
}) {
  if (!loaded || calendar.some((session) => session.status === 'scheduled'))
    return calendar;
  return buildShiftRuleSessions({
    days: policy.schedulingHorizonDays,
    fromDate: today,
    groupId,
    policy,
  });
}

/** Fill as many slots as the schedule supports; never discard a partial plan. */
export function applyTutoringSuggestions({
  form,
  fromDate,
  policy,
  schedule,
}: {
  form: TutoringFormValues;
  fromDate: string;
  policy: TutoringPolicy;
  schedule: WorkspaceUserGroupSession[];
}): { form: TutoringFormValues | null; message: TutoringSuggestionMessage } {
  const total = form.sessionSlots.length;
  const suggestions = suggestTutoringSlots(
    schedule,
    fromDate,
    total,
    policy,
    form.reasonType === 'WEAK_SUPPORT' ? 'consecutive' : 'separate'
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
