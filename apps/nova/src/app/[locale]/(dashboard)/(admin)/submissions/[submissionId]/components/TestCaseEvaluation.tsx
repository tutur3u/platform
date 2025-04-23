'use client';

import { type ExtendedNovaSubmission } from '../types';
import { Badge } from '@tuturuuu/ui/badge';
import { CheckCircle, XCircle } from '@tuturuuu/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';

interface TestCaseEvaluationProps {
  submission: ExtendedNovaSubmission;
}

export default function TestCaseEvaluation({
  submission,
}: TestCaseEvaluationProps) {
  if (!submission.test_cases || submission.test_cases.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <p className="text-muted-foreground">No test cases available</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-medium">Test Case Results</h3>
          <p className="text-muted-foreground text-sm">
            {submission.passed_tests} of {submission.total_tests} test cases
            passed
          </p>
        </div>
        <Badge
          variant={
            submission.passed_tests === submission.total_tests
              ? 'success'
              : 'secondary'
          }
        >
          {((submission.passed_tests / submission.total_tests) * 100).toFixed(
            0
          )}
          % Pass Rate
        </Badge>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">#</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Expected Output</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submission.test_cases.map((testCase, index) => (
              <TableRow
                key={testCase.test_case_id}
                className={
                  testCase.matched ? 'bg-success/5' : 'bg-destructive/5'
                }
              >
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>
                  <div className="max-h-20 overflow-auto">
                    <pre className="text-xs">
                      {testCase.test_case?.input || 'No input'}
                    </pre>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-h-20 overflow-auto">
                    <pre className="text-xs">
                      {testCase.test_case?.output || 'No expected output'}
                    </pre>
                  </div>
                </TableCell>
                <TableCell>
                  {testCase.matched ? (
                    <div className="text-success flex items-center">
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Passed
                    </div>
                  ) : (
                    <div className="text-destructive flex items-center">
                      <XCircle className="mr-1 h-4 w-4" />
                      Failed
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
