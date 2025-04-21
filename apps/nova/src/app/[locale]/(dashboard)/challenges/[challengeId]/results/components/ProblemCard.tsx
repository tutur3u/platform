import { ExtendedNovaSubmission } from '../types';
import SubmissionAccordion from './SubmissionAccordion';
import ScoreBadge from '@/components/common/ScoreBadge';
import { NovaProblem } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  ArrowUpDown,
  CheckCircle2,
  Clock,
  CodeIcon,
  Star,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

interface ProblemCardProps {
  problem: NovaProblem & {
    submissions: ExtendedNovaSubmission[];
  };
  problemIndex: number;
  sessionIndex: number;
}

export default function ProblemCard({
  problem,
  problemIndex,
  sessionIndex,
}: ProblemCardProps) {
  const bestSubmission =
    problem.submissions.length > 0
      ? Math.max(...problem.submissions.map((s) => s.total_score || 0))
      : 0;

  const latestSubmission =
    problem.submissions.length > 0
      ? problem.submissions.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
      : null;

  const testPassRate = latestSubmission
    ? (latestSubmission.passed_tests /
        Math.max(1, latestSubmission.total_tests)) *
      100
    : 0;

  const submissionCount = problem.submissions.length;

  // Maximum score for a problem is 10
  const MAX_SCORE = 10;
  const scoreProgress = (bestSubmission / MAX_SCORE) * 100;

  // Get color for score
  const getScoreColor = (score: number) => {
    const percentage = (score / MAX_SCORE) * 100;
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 60) return 'bg-yellow-500';
    if (percentage >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Calculate time between first and latest submission
  const firstSubmission =
    problem.submissions.length > 0
      ? problem.submissions.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0]
      : null;

  let timeSpent = '';
  if (firstSubmission && latestSubmission) {
    const firstTime = new Date(firstSubmission.created_at).getTime();
    const latestTime = new Date(latestSubmission.created_at).getTime();
    const diffMinutes = Math.floor((latestTime - firstTime) / 60000);

    if (diffMinutes < 1) {
      timeSpent = 'Less than a minute';
    } else if (diffMinutes < 60) {
      timeSpent = `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      timeSpent = `${hours} hour${hours !== 1 ? 's' : ''} ${mins > 0 ? `${mins} min` : ''}`;
    }
  }

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <CodeIcon className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="flex items-center gap-2">
              Problem {problemIndex + 1}
              {problem.title && (
                <span className="text-sm font-normal text-muted-foreground">
                  {problem.title}
                </span>
              )}
            </CardTitle>
          </div>
          {problem.submissions.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <ScoreBadge
                      score={bestSubmission}
                      maxScore={MAX_SCORE}
                      className="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium"
                    >
                      {bestSubmission.toFixed(1)}/{MAX_SCORE}
                    </ScoreBadge>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Best submission score</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1 px-2 py-0 text-xs">
            <ArrowUpDown className="h-3 w-3" />
            {submissionCount} submission{submissionCount !== 1 ? 's' : ''}
          </Badge>

          {latestSubmission && (
            <>
              <Badge
                variant="outline"
                className="gap-1 bg-dynamic-green/10 px-2 py-0 text-xs text-dynamic-green"
              >
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                {latestSubmission.passed_tests}/{latestSubmission.total_tests}{' '}
                tests passed
              </Badge>

              {timeSpent && (
                <Badge variant="outline" className="gap-1 px-2 py-0 text-xs">
                  <Clock className="h-3 w-3" />
                  {timeSpent}
                </Badge>
              )}
            </>
          )}
        </CardDescription>
      </CardHeader>

      {problem.submissions.length > 0 && (
        <CardContent className="pt-0 pb-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Star className="h-3 w-3" /> Score
                </span>
                <span
                  className={`font-medium ${bestSubmission >= 8 ? 'text-green-600' : bestSubmission >= 6 ? 'text-yellow-600' : bestSubmission >= 4 ? 'text-orange-600' : 'text-red-600'}`}
                >
                  {bestSubmission.toFixed(1)}/{MAX_SCORE}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${getScoreColor(bestSubmission)}`}
                  style={{ width: `${scoreProgress}%` }}
                />
              </div>
            </div>

            {testPassRate > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3" /> Test Pass Rate
                  </span>
                  <span
                    className={`font-medium ${testPassRate >= 80 ? 'text-green-600' : 'text-orange-600'}`}
                  >
                    {testPassRate.toFixed(0)}%
                  </span>
                </div>
                <Progress
                  value={testPassRate}
                  className="h-1.5"
                  indicatorClassName={
                    testPassRate >= 80 ? 'bg-green-500' : 'bg-orange-500'
                  }
                />
              </div>
            )}
          </div>
        </CardContent>
      )}

      <CardContent className={cn(problem.submissions.length > 0 ? 'pt-0' : '')}>
        {problem.submissions.length > 0 ? (
          <SubmissionAccordion
            submissions={problem.submissions.sort(
              (a, b) => (b.total_score || 0) - (a.total_score || 0)
            )}
            sessionIndex={sessionIndex}
            problemIndex={problemIndex}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <CodeIcon className="mb-2 h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No submissions yet</p>
            <p className="text-xs">Try solving this problem to see results</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
