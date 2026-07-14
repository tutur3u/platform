export type TaskProgressDay = { date: string; value: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcWeek(date: Date) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const weekday = start.getUTCDay() || 7;
  return addDays(start, 1 - weekday);
}

function sumRange(daily: TaskProgressDay[], from: string, to: string) {
  return daily
    .filter((day) => day.date >= from && day.date <= to)
    .reduce((sum, day) => sum + day.value, 0);
}

export function buildTaskProgressInsights(
  daily: TaskProgressDay[],
  now = new Date()
) {
  const today = formatDate(now);
  const weekStart = startOfUtcWeek(now);
  const previousWeekStart = addDays(weekStart, -7);
  const previousWeekEnd = addDays(weekStart, -1);
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const previousMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  const previousMonthEnd = addDays(monthStart, -1);
  const last30Start = addDays(now, -29);
  const last7Start = addDays(now, -6);
  const thisWeek = sumRange(daily, formatDate(weekStart), today);
  const previousWeek = sumRange(
    daily,
    formatDate(previousWeekStart),
    formatDate(previousWeekEnd)
  );
  const thisMonth = sumRange(daily, formatDate(monthStart), today);
  const previousMonth = sumRange(
    daily,
    formatDate(previousMonthStart),
    formatDate(previousMonthEnd)
  );
  const last30Days = sumRange(daily, formatDate(last30Start), today);
  const last7Days = sumRange(daily, formatDate(last7Start), today);
  const activeDaysLast30 = daily.filter(
    (day) =>
      day.date >= formatDate(last30Start) && day.date <= today && day.value > 0
  ).length;
  const elapsedWeekDays = Math.max(
    1,
    Math.min(7, Math.floor((now.getTime() - weekStart.getTime()) / DAY_MS) + 1)
  );
  const projectedWeek = (thisWeek / elapsedWeekDays) * 7;

  const weekdayTotals = Array.from({ length: 7 }, (_, weekday) => ({
    activeDays: 0,
    value: 0,
    weekday,
  }));
  let bestDay: TaskProgressDay | null = null;
  for (const day of daily) {
    if (!bestDay || day.value > bestDay.value) bestDay = day;
    const weekday = new Date(`${day.date}T00:00:00.000Z`).getUTCDay();
    const bucket = weekdayTotals[weekday];
    if (!bucket) continue;
    bucket.value += day.value;
    if (day.value > 0) bucket.activeDays += 1;
  }
  const strongestWeekday = [...weekdayTotals].sort(
    (a, b) => b.value - a.value
  )[0];
  const weekTrendPercent =
    previousWeek > 0
      ? ((projectedWeek - previousWeek) / previousWeek) * 100
      : projectedWeek > 0
        ? 100
        : 0;
  const consistencyScore = Math.round((activeDaysLast30 / 30) * 100);
  const momentumStatus =
    last30Days === 0
      ? 'starting'
      : weekTrendPercent >= 10
        ? 'accelerating'
        : weekTrendPercent <= -10
          ? 'slowing'
          : 'steady';
  const recommendation =
    last30Days === 0
      ? 'start_small'
      : weekTrendPercent >= 25
        ? 'raise_goal'
        : consistencyScore < 25
          ? 'rebuild_rhythm'
          : consistencyScore >= 60
            ? 'protect_streak'
            : 'stay_course';

  return {
    periods: {
      last7Days,
      last30Days,
      previousMonth,
      previousWeek,
      thisMonth,
      thisWeek,
    },
    insights: {
      activeDaysLast30,
      averageLast7: last7Days / 7,
      averageLast30: last30Days / 30,
      bestDay,
      consistencyScore,
      momentumStatus,
      projectedWeek,
      recommendation,
      strongestWeekday: strongestWeekday?.value ? strongestWeekday : null,
      weekTrendPercent,
      weekdayTotals,
    },
  };
}
