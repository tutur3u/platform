import { ExtendedNovaSubmission } from '../types';
import { Badge } from '@tuturuuu/ui/badge';

interface TestCaseEvaluationProps {
  submission: ExtendedNovaSubmission;
}

export default function TestCaseEvaluation({
  submission,
}: TestCaseEvaluationProps) {
  const testPassRatio =
    submission.total_tests > 0
      ? submission.passed_tests / submission.total_tests
      : 0;
  const testPassPercentage = testPassRatio * 100;

  return (
    <div className="rounded-md border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-medium">Test Results</h4>
        <Badge variant={testPassRatio >= 0.8 ? 'success' : 'warning'}>
          {testPassPercentage.toFixed(0)}% Passed
        </Badge>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Total Tests:</span>
          <span className="font-medium">{submission.total_tests}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Passed Tests:</span>
          <span className="font-medium text-green-600">
            {submission.passed_tests}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Failed Tests:</span>
          <span className="font-medium text-red-500">
            {submission.total_tests - submission.passed_tests}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Test Score:</span>
          <span className="font-medium">
            {submission.test_case_score.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
