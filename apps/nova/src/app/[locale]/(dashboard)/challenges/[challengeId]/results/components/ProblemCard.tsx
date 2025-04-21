import { ExtendedNovaSubmission } from '../types';
import SubmissionAccordion from './SubmissionAccordion';
import ScoreBadge from '@/components/common/ScoreBadge';
import { NovaProblem } from '@tuturuuu/types/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between">
          <span>Problem {problemIndex + 1}</span>
          {problem.submissions.length > 0 && (
            <ScoreBadge
              score={bestSubmission}
              maxScore={10}
              className="inline-flex items-center justify-center rounded-full px-2 py-1.5 font-medium"
            >
              Best score: {bestSubmission.toFixed(2)}/10
            </ScoreBadge>
          )}
        </CardTitle>
        <CardDescription>
          {problem.submissions.length} submission
          {problem.submissions.length !== 1 ? 's' : ''}
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
          <div className="text-muted-foreground py-8 text-center">
            <div className="mb-2">No submissions for this problem</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
