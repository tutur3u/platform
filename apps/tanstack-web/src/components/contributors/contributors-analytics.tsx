import {
  getMonthlyContributionValues,
  getTrendPoints,
  getWeeklyContributionValues,
  months,
  totalContributions,
} from './contributors-analytics-data';
import { ChartCard } from './contributors-primitives';
import type { GitHubContributor } from './types';

export function ContributionAnalytics({
  contributors,
}: {
  contributors: GitHubContributor[];
}) {
  const topContributors = contributors.slice(0, 5);
  const maxTopContribution = Math.max(
    ...topContributors.map((contributor) => contributor.contributions),
    1
  );
  const monthlyValues = getMonthlyContributionValues(contributors);
  const weeklyValues = getWeeklyContributionValues(contributors);
  const maxMonthlyValue = Math.max(...monthlyValues, 1);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <ChartCard
        description="Distribution of commits among leading contributors"
        title="Top 5 Contributors"
        tone="purple"
      >
        <div className="space-y-4">
          {topContributors.map((contributor, index) => (
            <div className="space-y-2" key={contributor.id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">
                  @{contributor.login}
                </span>
                <span className="text-foreground/60 tabular-nums">
                  {contributor.contributions.toLocaleString()} commits
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange"
                  style={{
                    width: `${Math.max(
                      (contributor.contributions / maxTopContribution) * 100,
                      index === topContributors.length - 1 ? 10 : 14
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard
        description="Activity patterns throughout the year"
        title="Monthly Contributions"
        tone="blue"
      >
        <div className="flex h-[300px] items-end gap-2">
          {monthlyValues.map((value, index) => (
            <div
              className="flex min-w-0 flex-1 flex-col items-center gap-3"
              key={months[index]}
            >
              <div className="flex h-60 w-full items-end rounded-md bg-foreground/5 px-1">
                <div
                  aria-label={`${months[index]} ${value} commits`}
                  className="w-full rounded-t-md bg-linear-to-t from-dynamic-blue to-dynamic-cyan"
                  role="img"
                  style={{
                    height: `${Math.max((value / maxMonthlyValue) * 100, 4)}%`,
                  }}
                />
              </div>
              <span className="text-foreground/50 text-xs">
                {months[index]}
              </span>
            </div>
          ))}
        </div>
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard
          description="Weekly contribution patterns showing community growth"
          title="Activity Trend"
          tone="green"
        >
          <div className="h-[300px] rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-4">
            <svg
              aria-label="Weekly contribution activity trend"
              className="h-full w-full overflow-visible"
              role="img"
              viewBox="0 0 100 100"
            >
              <defs>
                <linearGradient
                  id="contributors-trend"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--primary)"
                    stopOpacity="0.45"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--primary)"
                    stopOpacity="0.04"
                  />
                </linearGradient>
              </defs>
              <polyline
                fill="none"
                points={getTrendPoints(weeklyValues)}
                stroke="var(--primary)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
              <polygon
                fill="url(#contributors-trend)"
                points={`0,100 ${getTrendPoints(weeklyValues)} 100,100`}
              />
            </svg>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-md bg-foreground/5 p-3">
              <div className="font-semibold tabular-nums">
                {Math.max(...weeklyValues).toLocaleString()}
              </div>
              <div className="text-foreground/60 text-xs">Peak week</div>
            </div>
            <div className="rounded-md bg-foreground/5 p-3">
              <div className="font-semibold tabular-nums">
                {Math.round(
                  weeklyValues.reduce((sum, value) => sum + value, 0) /
                    weeklyValues.length
                ).toLocaleString()}
              </div>
              <div className="text-foreground/60 text-xs">Weekly avg</div>
            </div>
            <div className="rounded-md bg-foreground/5 p-3">
              <div className="font-semibold tabular-nums">
                {totalContributions(contributors).toLocaleString()}
              </div>
              <div className="text-foreground/60 text-xs">Known commits</div>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
