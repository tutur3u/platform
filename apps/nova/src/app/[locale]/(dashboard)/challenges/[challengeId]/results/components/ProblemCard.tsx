import { ExtendedNovaSubmission } from '../types';
import SubmissionAccordion from './SubmissionAccordion';
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
            <div
              className={`inline-flex items-center justify-center rounded-full px-2 py-1.5 font-medium ${
                bestSubmission >= 8
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                  : bestSubmission >= 5
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
              }`}
            >
              Best score: {bestSubmission.toFixed(2)}/10
            </div>
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
