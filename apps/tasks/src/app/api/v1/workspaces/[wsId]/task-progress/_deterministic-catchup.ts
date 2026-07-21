// Deterministic (non-AI) catch-up. Used as a graceful fallback whenever the AI
// path is unavailable (disabled, no credits/allocation, or a gateway error) so
// the panel always shows a useful summary instead of a hard error.

import type { buildTaskProgressInsights } from './_insights';

type Insights = ReturnType<typeof buildTaskProgressInsights>;

export interface DeterministicCatchupInput {
  period: 'weekly' | 'monthly';
  daily: Array<{ date: string; value: number }>;
  periods: Insights['periods'];
  insights: Insights['insights'];
  unitLabel?: string;
}

export interface DeterministicCatchup {
  executiveSummary: string;
  highlights: string[];
  watchouts: string[];
  nextActions: string[];
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const fmt = (value: number) => NUMBER.format(Math.max(0, value));

const MOMENTUM_PHRASE: Record<string, string> = {
  accelerating: 'Your momentum is accelerating',
  steady: 'You are keeping a steady pace',
  slowing: 'Your pace has slowed recently',
  starting: 'You are just getting started',
};

const RECOMMENDATION_ACTION: Record<string, string> = {
  raise_goal: 'You are ahead of pace — consider raising your goal.',
  protect_streak: 'Log a little today to protect your streak.',
  rebuild_rhythm: 'Aim for one small entry today to rebuild your rhythm.',
  stay_course: 'Keep doing what works — stay the course.',
  start_small: 'Start small: log any progress to build momentum.',
};

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function buildDeterministicCatchup(
  input: DeterministicCatchupInput
): DeterministicCatchup {
  const { period, periods, insights, unitLabel = 'units' } = input;
  const total = period === 'weekly' ? periods.thisWeek : periods.thisMonth;
  const previous =
    period === 'weekly' ? periods.previousWeek : periods.previousMonth;
  const activeDays = insights.activeDaysLast30;
  const streakWeekday =
    insights.strongestWeekday != null
      ? WEEKDAY_NAMES[insights.strongestWeekday.weekday]
      : null;

  const label = period === 'weekly' ? 'this week' : 'this month';
  const momentum =
    MOMENTUM_PHRASE[insights.momentumStatus] ?? MOMENTUM_PHRASE.steady;

  const executiveSummary =
    total > 0
      ? `${momentum}. You logged ${fmt(total)} ${unitLabel} ${label} across ${activeDays} active day${activeDays === 1 ? '' : 's'} in the last 30, with a ${insights.consistencyScore}% consistency score.`
      : `No progress recorded ${label} yet. ${RECOMMENDATION_ACTION[insights.recommendation] ?? RECOMMENDATION_ACTION.start_small}`;

  const highlights: string[] = [];
  if (total > 0) highlights.push(`${fmt(total)} ${unitLabel} logged ${label}.`);
  if (previous > 0) {
    const delta = total - previous;
    const pct = Math.round((delta / previous) * 100);
    highlights.push(
      `${delta >= 0 ? 'Up' : 'Down'} ${Math.abs(pct)}% vs the previous ${period === 'weekly' ? 'week' : 'month'}.`
    );
  }
  if (insights.bestDay && insights.bestDay.value > 0) {
    highlights.push(
      `Best day was ${insights.bestDay.date} with ${fmt(insights.bestDay.value)} ${unitLabel}.`
    );
  }
  if (streakWeekday)
    highlights.push(`${streakWeekday} is your strongest weekday.`);

  const watchouts: string[] = [];
  if (insights.momentumStatus === 'slowing') {
    watchouts.push(
      'Your recent pace is trending down — a small entry keeps it alive.'
    );
  }
  if (insights.consistencyScore < 25 && activeDays > 0) {
    watchouts.push(
      'Consistency is low; short, regular entries beat rare big ones.'
    );
  }
  if (total === 0 && previous > 0) {
    watchouts.push(
      `You were active last ${period === 'weekly' ? 'week' : 'month'} but haven't logged ${label}.`
    );
  }

  const nextActions: string[] = [
    RECOMMENDATION_ACTION[insights.recommendation] ??
      'Keep doing what works — stay the course.',
  ];
  if (insights.projectedWeek > 0 && period === 'weekly') {
    nextActions.push(
      `At this pace you'll reach about ${fmt(insights.projectedWeek)} ${unitLabel} by week's end.`
    );
  }
  nextActions.push('Review your goals to make sure they still fit your pace.');

  return {
    executiveSummary: executiveSummary.slice(0, 600),
    highlights: highlights.slice(0, 4),
    watchouts: watchouts.slice(0, 3),
    nextActions: nextActions.slice(0, 4),
  };
}
