import { ArrowUpDown, Clock, CodeIcon } from '@tuturuuu/icons';
import type { NovaProblem } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import ScoreBadge from '@/components/common/ScoreBadge';
import type { ExtendedNovaSubmission } from '../types';
import SubmissionAccordion from './SubmissionAccordion';

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
      ? problem.submissions.sort((a, b) => b.total_score - a.total_score)[0]
      : null;

  const latestSubmission =
    problem.submissions.length > 0
      ? problem.submissions.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
      : null;

  const firstSubmission =
    problem.submissions.length > 0
      ? problem.submissions.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0]
      : null;

  const submissionCount = problem.submissions.length;

  const bestScore = bestSubmission?.total_score || 0;

  // Maximum score for a problem is 10
  const MAX_SCORE = 10;

  // Calculate time between first and latest submission
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
      <CardHeader className="gap-2 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <CodeIcon className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="flex items-center gap-2">
              Problem {problemIndex + 1}
              {problem.title && (
                <span className="font-normal text-muted-foreground text-sm">
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
                      score={bestScore}
                      maxScore={MAX_SCORE}
                      className="inline-flex items-center justify-center rounded-full px-2 py-1 font-medium text-xs"
                    >
                      {bestScore.toFixed(1)}/{MAX_SCORE}
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

          {timeSpent && (
            <Badge variant="outline" className="gap-1 px-2 py-0 text-xs">
              <Clock className="h-3 w-3" />
              {timeSpent}
            </Badge>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
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
            <p className="font-medium text-sm">No submissions yet</p>
            <p className="text-xs">Try solving this problem to see results</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
