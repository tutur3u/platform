import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  BarChart3,
  Calendar,
  CheckCircle,
  Eye,
  Filter,
  MoreHorizontal,
  SortAsc,
  TrendingUp,
  Users,
  Vote,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

const mockPolls = [
  {
    id: 1,
    title: 'Which day should we schedule our team meeting?',
    type: 'multiple-choice',
    status: 'active',
    totalVotes: 24,
    endDate: new Date('2024-12-25'),
    createdBy: 'John Doe',
    options: [
      { text: 'Monday', votes: 8, percentage: 33 },
      { text: 'Tuesday', votes: 12, percentage: 50 },
      { text: 'Wednesday', votes: 4, percentage: 17 },
    ],
  },
  {
    id: 2,
    title: 'Should we implement the new feature this sprint?',
    type: 'yes-no',
    status: 'active',
    totalVotes: 18,
    endDate: new Date('2024-12-30'),
    createdBy: 'Jane Smith',
    options: [
      { text: 'Yes', votes: 14, percentage: 78 },
      { text: 'No', votes: 4, percentage: 22 },
    ],
  },
  {
    id: 3,
    title: 'Rate our new office layout',
    type: 'rating',
    status: 'completed',
    totalVotes: 45,
    endDate: new Date('2024-12-15'),
    createdBy: 'Mike Johnson',
    averageRating: 4.2,
    options: [
      { text: '5 stars', votes: 20, percentage: 44 },
      { text: '4 stars', votes: 15, percentage: 33 },
      { text: '3 stars', votes: 7, percentage: 16 },
      { text: '2 stars', votes: 2, percentage: 4 },
      { text: '1 star', votes: 1, percentage: 3 },
    ],
  },
  {
    id: 4,
    title: 'Rank your preferred project management tools',
    type: 'ranking',
    status: 'draft',
    totalVotes: 0,
    endDate: new Date('2025-01-15'),
    createdBy: 'Sarah Wilson',
    options: [
      { text: 'Jira', rank: 1 },
      { text: 'Trello', rank: 2 },
      { text: 'Asana', rank: 3 },
      { text: 'Monday.com', rank: 4 },
    ],
  },
];

interface PollCardProps {
  poll: (typeof mockPolls)[0];
  t: Awaited<ReturnType<typeof getTranslations>>;
}

function PollCard({ poll, t }: PollCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
      case 'completed':
        return 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue';
      case 'draft':
        return 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow';
      default:
        return 'border-border/30 bg-foreground/10 text-foreground';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'multiple-choice':
        return <Vote className="h-4 w-4" />;
      case 'yes-no':
        return <CheckCircle className="h-4 w-4" />;
      case 'rating':
        return <BarChart3 className="h-4 w-4" />;
      case 'ranking':
        return <TrendingUp className="h-4 w-4" />;
      default:
        return <Vote className="h-4 w-4" />;
    }
  };

  const getTypeDisplayName = (type: string) => {
    switch (type) {
      case 'multiple-choice':
        return t('ws-polls.multiple_choice');
      case 'yes-no':
        return t('ws-polls.yes_no');
      case 'rating':
        return t('ws-polls.rating');
      case 'ranking':
        return t('ws-polls.ranking');
      default:
        return type;
    }
  };

  const getStatusDisplayName = (status: string) => {
    switch (status) {
      case 'active':
        return t('ws-polls.active');
      case 'completed':
        return t('ws-polls.completed');
      case 'draft':
        return t('ws-polls.draft');
      default:
        return status;
    }
  };

  const isExpired = poll.endDate < new Date();

  return (
    <Card className="group cursor-pointer transition-all duration-300 hover:border-primary/30 hover:shadow-md">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="line-clamp-2 font-semibold text-foreground text-lg leading-tight">
              {poll.title}
            </CardTitle>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(
                  'font-medium text-xs',
                  getStatusColor(poll.status)
                )}
              >
                {getStatusDisplayName(poll.status)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {getTypeIcon(poll.type)}
                <span className="ml-1.5">{getTypeDisplayName(poll.type)}</span>
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {poll.status === 'active' && (
              <Button size="sm" className="shrink-0">
                {t('ws-polls.vote_now')}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Results/Options */}
        <div className="mb-4 space-y-3">
          {poll.type === 'rating' && poll.averageRating && (
            <div className="flex items-center gap-2 rounded-lg border border-dynamic-yellow/20 bg-dynamic-yellow/10 p-3">
              <span className="font-medium text-foreground/80 text-sm">
                {t('ws-polls.average_rating')}:
              </span>
              <span className="font-bold text-dynamic-yellow text-lg">
                {poll.averageRating}/5 ⭐
              </span>
            </div>
          )}

          {poll.options.slice(0, 3).map((option) => (
            <div key={option.text} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground/80">
                  {option.text}
                </span>
                <span className="font-semibold text-foreground">
                  {poll.type === 'ranking'
                    ? `#${'rank' in option ? option.rank : 1}`
                    : `${'votes' in option ? option.votes : 0} ${poll.totalVotes === 1 ? t('ws-polls.vote') : t('ws-polls.votes')}`}
                </span>
              </div>
              {poll.type !== 'ranking' && (
                <Progress
                  value={'percentage' in option ? option.percentage : 0}
                  className="h-2"
                />
              )}
            </div>
          ))}

          {poll.options.length > 3 && (
            <div className="text-center font-medium text-foreground/60 text-sm">
              +{poll.options.length - 3} {t('ws-polls.more_options')}
            </div>
          )}
        </div>

        {/* Footer */}
        <Separator className="mb-4" />
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-foreground/70">
              <Users className="h-4 w-4" />
              <span className="font-medium">
                {poll.totalVotes}{' '}
                {poll.totalVotes === 1
                  ? t('ws-polls.vote')
                  : t('ws-polls.votes')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground/70">
              <Calendar className="h-4 w-4" />
              <span
                className={cn('font-medium', isExpired && 'text-dynamic-red')}
              >
                {isExpired ? t('ws-polls.ended') : t('ws-polls.ends')}{' '}
                {poll.endDate.toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="text-foreground/60 text-xs">
            {t('ws-polls.created_by')} {poll.createdBy}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface QuickStatsProps {
  t: Awaited<ReturnType<typeof getTranslations>>;
}

function QuickStats({ t }: QuickStatsProps) {
  const stats = [
    {
      title: t('ws-polls.total_polls'),
      value: '4',
      icon: Vote,
      color: 'text-dynamic-blue',
      bg: 'bg-gradient-to-br from-dynamic-blue/5 to-dynamic-blue/10 border-dynamic-blue/20',
    },
    {
      title: t('ws-polls.active_polls'),
      value: '2',
      icon: TrendingUp,
      color: 'text-dynamic-green',
      bg: 'bg-gradient-to-br from-dynamic-green/5 to-dynamic-green/10 border-dynamic-green/20',
    },
    {
      title: t('ws-polls.total_votes'),
      value: '87',
      icon: Users,
      color: 'text-dynamic-purple',
      bg: 'bg-gradient-to-br from-dynamic-purple/5 to-dynamic-purple/10 border-dynamic-purple/20',
    },
    {
      title: t('ws-polls.participation_rate'),
      value: '73%',
      icon: Eye,
      color: 'text-dynamic-orange',
      bg: 'bg-gradient-to-br from-dynamic-orange/5 to-dynamic-orange/10 border-dynamic-orange/20',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.title}
          className={cn(
            'group transition-all duration-300 hover:scale-105 hover:shadow-md',
            stat.bg
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'rounded-lg bg-white/80 p-2 shadow-sm dark:bg-gray-800/80'
                )}
              >
                <stat.icon className={cn('h-5 w-5', stat.color)} />
              </div>
              <div className="flex-1">
                <div className={cn('font-bold text-2xl', stat.color)}>
                  {stat.value}
                </div>
                <p className="font-medium text-foreground/70 text-sm">
                  {stat.title}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-2">
          <div className="h-4 animate-pulse rounded bg-foreground/10" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-foreground/5" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="h-2 animate-pulse rounded bg-foreground/10" />
          <div className="h-2 animate-pulse rounded bg-foreground/10" />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PollsPage() {
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <FeatureSummary
        pluralTitle={t('sidebar_tabs.polls')}
        description={t('ws-polls.description')}
        action={
          <Button className="w-full md:w-fit">
            <Vote className="mr-2 h-5 w-5" />
            {t('ws-polls.create')}
          </Button>
        }
      />

      <Separator className="my-6" />

      {/* Quick Stats */}
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={`stats-loading-${Date.now()}-${i}`}
                className="h-24 animate-pulse rounded-lg bg-foreground/5"
              />
            ))}
          </div>
        }
      >
        <QuickStats t={t} />
      </Suspense>

      <Separator className="my-6" />

      {/* Polls Section */}
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-foreground text-xl">
            {t('ws-polls.recent_polls')}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              {t('ws-polls.filter')}
            </Button>
            <Button variant="outline" size="sm">
              <SortAsc className="mr-2 h-4 w-4" />
              {t('ws-polls.sort')}
            </Button>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <LoadingCard key={`poll-loading-${Date.now()}-${i}`} />
              ))}
            </div>
          }
        >
          <div className="grid gap-6 md:grid-cols-2">
            {mockPolls.map((poll) => (
              <PollCard key={poll.id} poll={poll} t={t} />
            ))}
          </div>
        </Suspense>

        {/* Enhanced Empty State */}
        <Card className="border-2 border-border/50 border-dashed bg-foreground/5">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-dynamic-blue/10">
              <Vote className="h-10 w-10 text-dynamic-blue" />
            </div>
            <h3 className="mb-2 font-semibold text-foreground text-lg">
              {t('ws-polls.no_more_polls')}
            </h3>
            <p className="mb-6 max-w-sm text-foreground/60 text-sm">
              {t('ws-polls.no_more_polls_desc')}
            </p>
            <Button>
              <Vote className="mr-2 h-4 w-4" />
              {t('ws-polls.create_first_poll')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
