import { ExtendedNovaSubmission } from '../types';
import { NovaProblem, NovaSession } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  AlertCircle,
  Award,
  Calendar,
  Clock,
  Target,
  Zap,
} from '@tuturuuu/ui/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';

interface SessionCardProps {
  session: NovaSession & {
    problems: (NovaProblem & {
      submissions: ExtendedNovaSubmission[];
    })[];
  };
  sessionIndex: number;
}

export default function SessionCard({
  session,
  sessionIndex,
}: SessionCardProps) {
  // Maximum score constant - each problem is worth 10 points
  const MAX_SCORE_PER_PROBLEM = 10;

  // Calculate total score, problems attempted, and total submissions
  const totalScore = session.problems.reduce((sum, problem) => {
    const bestScore =
      problem.submissions.length > 0
        ? Math.max(...problem.submissions.map((s) => s.total_score || 0))
        : 0;
    return sum + bestScore;
  }, 0);

  const maxPossibleScore = session.problems.length * MAX_SCORE_PER_PROBLEM;
  const problemsAttempted = session.problems.filter(
    (problem) => problem.submissions.length > 0
  ).length;

  const totalSubmissions = session.problems.reduce(
    (sum, problem) => sum + problem.submissions.length,
    0
  );

  // Calculate session duration
  const startTime = new Date(session.created_at);
  const endTime = session.end_time ? new Date(session.end_time) : new Date();
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  // Calculate session status
  const isActive = !session.end_time;
  const timeAgo = formatDistanceToNow(startTime, { addSuffix: true });

  // Calculate percentage score
  const percentageScore = (totalScore / maxPossibleScore) * 100;

  // Determine score color based on percentage
  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-500';
    if (percentage >= 60) return 'text-yellow-500';
    if (percentage >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  // Determine progress bar color based on percentage
  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 60) return 'bg-yellow-500';
    if (percentage >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const scoreColorClass = getScoreColor(percentageScore);
  const progressColorClass = getProgressColor(percentageScore);

  // Calculate average score per problem for attempted problems
  const averageScore =
    problemsAttempted > 0 ? totalScore / problemsAttempted : 0;

  return (
    <Card className="mb-4 overflow-hidden border-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
              <Target className="text-primary h-4 w-4" />
            </div>
            <CardTitle>Session {sessionIndex + 1}</CardTitle>
            {isActive && (
              <Badge
                variant="outline"
                className="border-green-200 bg-green-500/10 text-green-600"
              >
                Active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="text-muted-foreground flex items-center">
              <Calendar className="mr-1 h-3.5 w-3.5" />
              {timeAgo}
            </div>
            <div className="text-muted-foreground flex items-center">
              <Clock className="mr-1 h-3.5 w-3.5" />
              {hours > 0 ? `${hours}h ` : ''}
              {minutes}m
            </div>
          </div>
        </div>
        <CardDescription className="mt-2 flex flex-col gap-2">
          <span>Started: {startTime.toLocaleString()}</span>
          {session.end_time && (
            <span>Ended: {new Date(session.end_time).toLocaleString()}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="bg-card/50 hover:bg-card flex flex-col rounded-lg border p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                Total Score
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Award className="text-primary h-4 w-4" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Each problem is worth max 10 points
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="mt-2 flex items-baseline">
              <span className={`text-2xl font-bold ${scoreColorClass}`}>
                {totalScore.toFixed(1)}
              </span>
              <span className="text-muted-foreground ml-1 text-sm">
                /{maxPossibleScore}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              {percentageScore.toFixed(0)}% completion
            </div>
            <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${progressColorClass}`}
                style={{ width: `${percentageScore}%` }}
              />
            </div>
          </div>

          <div className="bg-card/50 hover:bg-card flex flex-col rounded-lg border p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                Problems Attempted
              </span>
              <Zap className="text-primary h-4 w-4" />
            </div>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl font-bold">{problemsAttempted}</span>
              <span className="text-muted-foreground ml-1 text-sm">
                /{session.problems.length}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              {((problemsAttempted / session.problems.length) * 100).toFixed(0)}
              % attempted
            </div>
            <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{
                  width: `${(problemsAttempted / session.problems.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="bg-card/50 hover:bg-card flex flex-col rounded-lg border p-4 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                Performance
              </span>
              <AlertCircle className="text-primary h-4 w-4" />
            </div>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl font-bold">
                {averageScore.toFixed(1)}
              </span>
              <span className="text-muted-foreground ml-1 text-sm">
                /{MAX_SCORE_PER_PROBLEM} per problem
              </span>
            </div>
            <div className="text-muted-foreground mt-1 flex justify-between text-xs">
              <span>
                {totalSubmissions} submission{totalSubmissions !== 1 ? 's' : ''}
              </span>
              <span>
                {(totalSubmissions / Math.max(1, problemsAttempted)).toFixed(1)}{' '}
                per problem
              </span>
            </div>
            <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${getProgressColor((averageScore / MAX_SCORE_PER_PROBLEM) * 100)}`}
                style={{
                  width: `${(averageScore / MAX_SCORE_PER_PROBLEM) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
