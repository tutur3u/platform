import CriteriaEvaluation from './CriteriaEvaluation';
import TestCaseEvaluation from './TestCaseEvaluation';
import type { NovaSubmissionData } from '@tuturuuu/types/db';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';

interface SubmissionDetailsProps {
  submission: NovaSubmissionData;
}

export default function SubmissionDetails({
  submission,
}: SubmissionDetailsProps) {
  return (
    <div className="space-y-6 pt-2">
      {/* Solution */}
      <div>
        <h4 className="mb-2 text-sm font-medium">Your Solution</h4>
        <div className="max-h-64 overflow-y-auto rounded-lg bg-muted p-3 whitespace-pre-wrap">
          {submission.prompt || 'No solution provided'}
        </div>
      </div>

      {/* Tabs for Test Cases and Criteria */}
      <Tabs defaultValue="criteria" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="test-cases">Test Case Evaluation</TabsTrigger>
          <TabsTrigger value="criteria">Criteria Evaluation</TabsTrigger>
        </TabsList>

        {/* Test Case Evaluation Tab */}
        <TabsContent value="test-cases">
          <TestCaseEvaluation submission={submission} />
        </TabsContent>

        {/* Criteria Evaluation Tab */}
        <TabsContent value="criteria">
          <CriteriaEvaluation submission={submission} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
