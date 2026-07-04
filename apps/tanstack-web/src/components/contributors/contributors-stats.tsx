import { GitCommit, GitPullRequest, Star, Users } from '@tuturuuu/icons/lucide';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { joinClassNames, toneClasses } from './contributors-primitives';
import type { ContributorStat, GitHubContributor, RepoStats } from './types';

export function ContributorsStats({
  contributors,
  stats,
}: {
  contributors: GitHubContributor[];
  stats: RepoStats;
}) {
  const statCards: ContributorStat[] = [
    {
      color: 'purple',
      icon: Users,
      label: 'Contributors',
      trend: '+12 this month',
      value: stats.contributors,
    },
    {
      color: 'green',
      icon: GitPullRequest,
      label: 'Pull Requests',
      trend: 'All time',
      value: stats.pullRequests,
    },
    {
      color: 'blue',
      icon: GitCommit,
      label: 'Total Commits',
      trend: 'Since inception',
      value: contributors.reduce(
        (sum, contributor) => sum + contributor.contributions,
        0
      ),
    },
    {
      color: 'amber',
      icon: Star,
      label: 'GitHub Stars',
      trend: 'Growing daily',
      value: stats.stars,
    },
  ];

  return (
    <section className="relative px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
            Community{' '}
            <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
              Impact
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
            Our open source journey by the numbers
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            const tone = toneClasses[stat.color];

            return (
              <Card
                className={joinClassNames(
                  'h-full p-8 text-center transition-all hover:shadow-lg',
                  tone.card
                )}
                key={stat.label}
              >
                <div
                  className={joinClassNames(
                    'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                    tone.iconFrame
                  )}
                >
                  <Icon className={joinClassNames('h-8 w-8', tone.icon)} />
                </div>
                <div
                  className={joinClassNames(
                    'mb-2 font-bold text-4xl',
                    tone.text
                  )}
                >
                  {stat.value.toLocaleString()}+
                </div>
                <div className="mb-3 font-medium text-foreground/80 text-sm">
                  {stat.label}
                </div>
                <Badge
                  className={joinClassNames('text-xs', tone.badge)}
                  variant="secondary"
                >
                  {stat.trend}
                </Badge>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
