import type {
  MeetTogetherPlan,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';

export const MEET_SLOT_MINUTES = 15;

export interface MeetRankedTimeframe {
  date: string;
  startMinute: number;
  endMinute: number;
  confirmedUserIds: string[];
  tentativeUserIds: string[];
  unavailableUserIds: string[];
  confirmedPercent: number;
  weightedPercent: number;
}

export interface MeetPlanInsights {
  participantCount: number;
  respondedCount: number;
  responsePercent: number;
  peakAttendance: number;
  peakAttendancePercent: number;
  averageAvailabilityPercent: number;
  overlapByDate: Array<{ date: string; peak: number }>;
  availabilityByHour: Array<{ hour: number; percent: number }>;
}

function minuteFromTime(value?: string) {
  const match = value?.match(/^(\d{1,2}):(\d{2})/u);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function cellKey(date: string, minute: number) {
  return `${date}:${minute}`;
}

function buildUserStatusMap(timeblocks: Timeblock[]) {
  const status = new Map<string, 'confirmed' | 'tentative'>();

  for (const block of timeblocks) {
    if (!block.user_id || !block.date) continue;
    const start = minuteFromTime(block.start_time);
    const end = minuteFromTime(block.end_time);

    for (let minute = start; minute < end; minute += MEET_SLOT_MINUTES) {
      const key = `${block.user_id}:${cellKey(block.date, minute)}`;
      if (!block.tentative || !status.has(key)) {
        status.set(key, block.tentative ? 'tentative' : 'confirmed');
      }
    }
  }

  return status;
}

export function rankMeetTimeframes({
  plan,
  users,
  timeblocks,
  includeTentative = true,
}: {
  plan: MeetTogetherPlan;
  users: PlanUser[];
  timeblocks: Timeblock[];
  includeTentative?: boolean;
}): MeetRankedTimeframe[] {
  const userIds = users.flatMap((user) => (user.id ? [user.id] : []));
  const participantCount = userIds.length;
  if (participantCount === 0) return [];

  const startMinute = minuteFromTime(plan.start_time);
  const endMinute = minuteFromTime(plan.end_time);
  const duration = Math.max(MEET_SLOT_MINUTES, plan.duration_minutes ?? 60);
  const status = buildUserStatusMap(timeblocks);
  const ranked: MeetRankedTimeframe[] = [];

  for (const date of plan.dates ?? []) {
    for (
      let candidateStart = startMinute;
      candidateStart + duration <= endMinute;
      candidateStart += MEET_SLOT_MINUTES
    ) {
      const confirmedUserIds: string[] = [];
      const tentativeUserIds: string[] = [];
      const unavailableUserIds: string[] = [];

      for (const userId of userIds) {
        let confirmed = true;
        let available = true;

        for (
          let minute = candidateStart;
          minute < candidateStart + duration;
          minute += MEET_SLOT_MINUTES
        ) {
          const cellStatus = status.get(`${userId}:${cellKey(date, minute)}`);
          confirmed &&= cellStatus === 'confirmed';
          available &&=
            cellStatus === 'confirmed' || cellStatus === 'tentative';
        }

        if (confirmed) confirmedUserIds.push(userId);
        else if (available && includeTentative) tentativeUserIds.push(userId);
        else unavailableUserIds.push(userId);
      }

      const confirmedPercent =
        (confirmedUserIds.length / participantCount) * 100;
      const weightedPercent =
        ((confirmedUserIds.length + tentativeUserIds.length * 0.5) /
          participantCount) *
        100;

      ranked.push({
        date,
        startMinute: candidateStart,
        endMinute: candidateStart + duration,
        confirmedUserIds,
        tentativeUserIds,
        unavailableUserIds,
        confirmedPercent,
        weightedPercent,
      });
    }
  }

  return ranked.sort(
    (a, b) =>
      b.confirmedUserIds.length - a.confirmedUserIds.length ||
      b.weightedPercent - a.weightedPercent ||
      a.date.localeCompare(b.date) ||
      a.startMinute - b.startMinute
  );
}

export function calculateMeetPlanInsights({
  plan,
  users,
  timeblocks,
}: {
  plan: MeetTogetherPlan;
  users: PlanUser[];
  timeblocks: Timeblock[];
}): MeetPlanInsights {
  const participantCount = users.filter((user) => user.id).length;
  const respondedIds = new Set(
    timeblocks.flatMap((block) => (block.user_id ? [block.user_id] : []))
  );
  const ranked = rankMeetTimeframes({ plan, users, timeblocks });
  const overlapByDate = (plan.dates ?? []).map((date) => ({
    date,
    peak: Math.max(
      0,
      ...ranked
        .filter((candidate) => candidate.date === date)
        .map((candidate) => candidate.confirmedUserIds.length)
    ),
  }));
  const peakAttendance = Math.max(0, ...overlapByDate.map(({ peak }) => peak));
  const averageAvailabilityPercent = ranked.length
    ? ranked.reduce((sum, candidate) => sum + candidate.weightedPercent, 0) /
      ranked.length
    : 0;
  const status = buildUserStatusMap(timeblocks);
  const userIds = users.flatMap((user) => (user.id ? [user.id] : []));
  const dates = plan.dates ?? [];
  const startHour = Math.floor(minuteFromTime(plan.start_time) / 60);
  const endHour = Math.ceil(minuteFromTime(plan.end_time) / 60);
  const availabilityByHour = Array.from(
    { length: Math.max(0, endHour - startHour) },
    (_, index) => {
      const hour = startHour + index;
      let weightedCells = 0;
      for (const date of dates) {
        for (const userId of userIds) {
          for (let minute = hour * 60; minute < hour * 60 + 60; minute += 15) {
            const cellStatus = status.get(`${userId}:${cellKey(date, minute)}`);
            weightedCells +=
              cellStatus === 'confirmed'
                ? 1
                : cellStatus === 'tentative'
                  ? 0.5
                  : 0;
          }
        }
      }
      const possibleCells = dates.length * userIds.length * 4;
      return {
        hour,
        percent: possibleCells ? (weightedCells / possibleCells) * 100 : 0,
      };
    }
  );

  return {
    participantCount,
    respondedCount: respondedIds.size,
    responsePercent: participantCount
      ? (respondedIds.size / participantCount) * 100
      : 0,
    peakAttendance,
    peakAttendancePercent: participantCount
      ? (peakAttendance / participantCount) * 100
      : 0,
    averageAvailabilityPercent,
    overlapByDate,
    availabilityByHour,
  };
}

export function formatMinuteOfDay(minute: number) {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
