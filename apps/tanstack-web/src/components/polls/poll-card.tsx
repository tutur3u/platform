import {
  BarChart3,
  Calendar,
  CheckCircle,
  MoreHorizontal,
  Star,
  TrendingUp,
  Users,
  Vote,
} from '@tuturuuu/icons/lucide';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import type { MockPoll } from '../../data/polls/mock-polls';
import type { AppMessages } from '../../lib/platform/messages';

type PollsMessages = AppMessages['ws-polls'];

type PollCardProps = {
  messages: PollsMessages;
  poll: MockPoll;
};

export function PollCard({ messages, poll }: PollCardProps) {
  const isExpired = false;

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
                className={cn(
                  'font-medium text-xs',
                  getStatusColor(poll.status)
                )}
                variant="secondary"
              >
                {getStatusDisplayName(messages, poll.status)}
              </Badge>
              <Badge className="text-xs" variant="outline">
                {getTypeIcon(poll.type)}
                <span className="ml-1.5">
                  {getTypeDisplayName(messages, poll.type)}
                </span>
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {poll.status === 'active' && (
              <Button className="shrink-0" size="sm">
                {messages.vote_now}
              </Button>
            )}
            <Button className="h-8 w-8 p-0" size="sm" variant="ghost">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="mb-4 space-y-3">
          {poll.type === 'rating' && poll.averageRating && (
            <div className="flex items-center gap-2 rounded-lg border border-dynamic-yellow/20 bg-dynamic-yellow/10 p-3">
              <span className="font-medium text-foreground/80 text-sm">
                {messages.average_rating}:
              </span>
              <span className="flex items-center gap-1 font-bold text-dynamic-yellow text-lg">
                {poll.averageRating}/5
                <Star className="h-4 w-4 fill-current" />
              </span>
            </div>
          )}

          {poll.options.slice(0, 3).map((option) => (
            <div className="space-y-2" key={option.text}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground/80">
                  {option.text}
                </span>
                <span className="font-semibold text-foreground">
                  {'rank' in option
                    ? `#${option.rank}`
                    : `${option.votes} ${
                        poll.totalVotes === 1 ? messages.vote : messages.votes
                      }`}
                </span>
              </div>
              {'percentage' in option && (
                <Progress className="h-2" value={option.percentage} />
              )}
            </div>
          ))}

          {poll.options.length > 3 && (
            <div className="text-center font-medium text-foreground/60 text-sm">
              +{poll.options.length - 3} {messages.more_options}
            </div>
          )}
        </div>

        <Separator className="mb-4" />
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-foreground/70">
              <Users className="h-4 w-4" />
              <span className="font-medium">
                {poll.totalVotes}{' '}
                {poll.totalVotes === 1 ? messages.vote : messages.votes}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground/70">
              <Calendar className="h-4 w-4" />
              <span
                className={cn('font-medium', isExpired && 'text-dynamic-red')}
              >
                {isExpired ? messages.ended : messages.ends}{' '}
                {poll.endDate.toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="text-foreground/60 text-xs">
            {messages.created_by} {poll.createdBy}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getStatusColor(status: MockPoll['status']) {
  switch (status) {
    case 'active':
      return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
    case 'completed':
      return 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue';
    case 'draft':
      return 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow';
  }
}

function getStatusDisplayName(
  messages: PollsMessages,
  status: MockPoll['status']
) {
  return messages[status];
}

function getTypeDisplayName(messages: PollsMessages, type: MockPoll['type']) {
  switch (type) {
    case 'multiple-choice':
      return messages.multiple_choice;
    case 'yes-no':
      return messages.yes_no;
    case 'rating':
      return messages.rating;
    case 'ranking':
      return messages.ranking;
  }
}

function getTypeIcon(type: MockPoll['type']) {
  switch (type) {
    case 'multiple-choice':
      return <Vote className="h-4 w-4" />;
    case 'yes-no':
      return <CheckCircle className="h-4 w-4" />;
    case 'rating':
      return <BarChart3 className="h-4 w-4" />;
    case 'ranking':
      return <TrendingUp className="h-4 w-4" />;
  }
}
