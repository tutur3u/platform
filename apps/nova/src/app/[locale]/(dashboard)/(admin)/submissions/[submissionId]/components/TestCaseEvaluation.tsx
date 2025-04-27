'use client';

import { type ExtendedNovaSubmission } from '../types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  XCircle,
} from '@tuturuuu/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { Fragment, useState } from 'react';

interface TestCaseEvaluationProps {
  submission: ExtendedNovaSubmission;
}

export default function TestCaseEvaluation({
  submission,
}: TestCaseEvaluationProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  if (!submission.test_cases || submission.test_cases.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <p className="text-muted-foreground">No test cases available</p>
      </div>
    );
  }

  const toggleRow = (index: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Helper to render confidence badge with appropriate color
  const renderConfidenceBadge = (confidence: number | null | undefined) => {
    if (confidence === null || confidence === undefined) return null;

    let variant:
      | 'default'
      | 'success'
      | 'warning'
      | 'destructive'
      | 'secondary'
      | 'outline' = 'default';
    if (confidence >= 0.8) variant = 'success';
    else if (confidence >= 0.5) variant = 'warning';
    else variant = 'destructive';

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={variant} className="ml-2">
              <BrainCircuit className="mr-1 h-3 w-3" />
              {Math.round(confidence * 100)}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>AI confidence in this result</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

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
              <TableHead className="w-[60px]">#</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Expected vs Actual</TableHead>
              <TableHead className="w-[80px]">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submission.test_cases.map((testCase, index) => {
              const rowKey = `row-${index}`;
              const isExpanded = expandedRows[rowKey] || false;

              return (
                <Fragment key={testCase.test_case_id}>
                  <TableRow
                    key={testCase.test_case_id}
                    className={
                      testCase.matched ? 'bg-success/5' : 'bg-destructive/5'
                    }
                  >
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      {testCase.matched ? (
                        <div className="text-success flex items-center">
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Passed
                          {renderConfidenceBadge(testCase.confidence)}
                        </div>
                      ) : (
                        <div className="text-destructive flex items-center">
                          <XCircle className="mr-1 h-4 w-4" />
                          Failed
                          {renderConfidenceBadge(testCase.confidence)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-h-20 overflow-auto">
                        <pre className="whitespace-pre-wrap text-xs">
                          {testCase.test_case?.input || 'No input'}
                        </pre>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <div>
                          <span className="text-muted-foreground text-xs font-semibold">
                            Expected:
                          </span>
                          <div className="max-h-20 overflow-auto">
                            <pre className="whitespace-pre-wrap text-xs">
                              {testCase.test_case?.output ||
                                'No expected output'}
                            </pre>
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs font-semibold">
                            Actual:
                          </span>
                          <div className="max-h-20 overflow-auto">
                            <pre
                              className={`whitespace-pre-wrap text-xs ${!testCase.matched ? 'text-destructive' : ''}`}
                            >
                              {testCase.output || 'No output'}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleRow(rowKey)}
                        className="hover:bg-muted rounded p-1 transition-colors"
                        aria-label={
                          isExpanded ? 'Hide details' : 'Show details'
                        }
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && testCase.reasoning && (
                    <TableRow
                      className={
                        testCase.matched ? 'bg-success/5' : 'bg-destructive/5'
                      }
                    >
                      <TableCell colSpan={5} className="px-4 py-3">
                        <div className="bg-background/80 rounded-md p-3 shadow-sm">
                          <div className="mb-2 flex items-center gap-2">
                            <AlertCircle className="text-muted-foreground h-4 w-4" />
                            <h4 className="font-medium">Reasoning</h4>
                          </div>
                          <p className="whitespace-pre-wrap text-sm">
                            {testCase.reasoning}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
