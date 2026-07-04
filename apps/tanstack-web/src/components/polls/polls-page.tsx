import {
  Eye,
  Filter,
  SortAsc,
  TrendingUp,
  Users,
  Vote,
} from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { mockPolls } from '../../data/polls/mock-polls';
import type { AppMessages } from '../../lib/platform/messages';
import { PollCard } from './poll-card';

type PollsMessages = AppMessages['ws-polls'];

type PollsPageProps = {
  messages: AppMessages;
};

export function PollsPage({ messages }: PollsPageProps) {
  const pollsMessages = messages['ws-polls'];

  return (
    <div className="space-y-6">
      <FeatureSummary
        action={
          <Button className="w-full md:w-fit">
            <Vote className="mr-2 h-5 w-5" />
            {pollsMessages.create}
          </Button>
        }
        description={pollsMessages.description}
        pluralTitle={messages.sidebar_tabs.polls}
      />

      <Separator className="my-6" />
      <QuickStats messages={pollsMessages} />
      <Separator className="my-6" />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-foreground text-xl">
            {pollsMessages.recent_polls}
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              {pollsMessages.filter}
            </Button>
            <Button size="sm" variant="outline">
              <SortAsc className="mr-2 h-4 w-4" />
              {pollsMessages.sort}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {mockPolls.map((poll) => (
            <PollCard key={poll.id} messages={pollsMessages} poll={poll} />
          ))}
        </div>

        <Card className="border-2 border-border/50 border-dashed bg-foreground/5">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-dynamic-blue/10">
              <Vote className="h-10 w-10 text-dynamic-blue" />
            </div>
            <h3 className="mb-2 font-semibold text-foreground text-lg">
              {pollsMessages.no_more_polls}
            </h3>
            <p className="mb-6 max-w-sm text-foreground/60 text-sm">
              {pollsMessages.no_more_polls_desc}
            </p>
            <Button>
              <Vote className="mr-2 h-4 w-4" />
              {pollsMessages.create_first_poll}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickStats({ messages }: { messages: PollsMessages }) {
  const stats = [
    {
      bg: 'bg-linear-to-br from-dynamic-blue/5 to-dynamic-blue/10 border-dynamic-blue/20',
      color: 'text-dynamic-blue',
      icon: Vote,
      title: messages.total_polls,
      value: '4',
    },
    {
      bg: 'bg-linear-to-br from-dynamic-green/5 to-dynamic-green/10 border-dynamic-green/20',
      color: 'text-dynamic-green',
      icon: TrendingUp,
      title: messages.active_polls,
      value: '2',
    },
    {
      bg: 'bg-linear-to-br from-dynamic-purple/5 to-dynamic-purple/10 border-dynamic-purple/20',
      color: 'text-dynamic-purple',
      icon: Users,
      title: messages.total_votes,
      value: '87',
    },
    {
      bg: 'bg-linear-to-br from-dynamic-orange/5 to-dynamic-orange/10 border-dynamic-orange/20',
      color: 'text-dynamic-orange',
      icon: Eye,
      title: messages.participation_rate,
      value: '73%',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card
          className={cn(
            'group transition-all duration-300 hover:scale-105 hover:shadow-md',
            stat.bg
          )}
          key={stat.title}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/80 p-2 shadow-sm dark:bg-gray-800/80">
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

export function PollsLoadingCard() {
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
