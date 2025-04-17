import { ExtendedNovaSubmission } from '../types';
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
            <div
              className={`inline-flex items-center justify-center rounded-full px-2 py-1.5 font-medium ${
                submission.test_case_score >= 4
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                  : submission.test_case_score >= 2
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
              }`}
            >
              {submission.test_case_score.toFixed(2)}/5
            </div>
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
