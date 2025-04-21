import { ExtendedNovaSubmission } from '../types';
import ScoreBadge from '@/components/common/ScoreBadge';
import { Progress } from '@tuturuuu/ui/progress';

interface TestCaseEvaluationProps {
  submission: ExtendedNovaSubmission;
}

export default function TestCaseEvaluation({
  submission,
}: TestCaseEvaluationProps) {
  return (
    <div className="space-y-4">
      {submission.total_tests > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm">
              Passed {submission.passed_tests} of {submission.total_tests} test
              cases
            </span>
            <ScoreBadge
              score={submission.test_case_score}
              maxScore={10}
              className="inline-flex items-center justify-center rounded-full px-2 py-1.5 font-medium"
            >
              {submission.test_case_score.toFixed(2)}/10
            </ScoreBadge>
          </div>
          <Progress
            value={(submission.passed_tests / submission.total_tests) * 100}
            className="h-2 w-full"
          />
        </div>
      ) : (
        <div className="text-muted-foreground py-4 text-center">
          No test cases available for this problem
        </div>
      )}
    </div>
  );
}
