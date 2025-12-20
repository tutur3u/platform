import {
  CheckCircle2,
  Clock,
  Code,
  Info,
  Split,
  ThumbsUp,
  XCircle,
} from '@tuturuuu/icons';
import type { NovaSubmissionData } from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useState } from 'react';
import ScoreBadge from '@/components/common/ScoreBadge';
import SideBySideDiff from '@/components/common/SideBySideDiff';

interface TestCaseEvaluationProps {
  submission: Partial<NovaSubmissionData>;
  showSkeleton: boolean;
}

export default function TestCaseEvaluation({
  submission,
  showSkeleton,
}: TestCaseEvaluationProps) {
  const [expandedTestCase, setExpandedTestCase] = useState<string | null>(null);

  // Get confidence badge color
  const getConfidenceBadge = (confidence: number | null | undefined) => {
    if (confidence === null || confidence === undefined) return null;

    if (confidence >= 0.9) {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          Very High
        </Badge>
      );
    } else if (confidence >= 0.7) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          High
        </Badge>
      );
    } else if (confidence >= 0.5) {
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Medium
        </Badge>
      );
    } else if (confidence >= 0.3) {
      return (
        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
          Low
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          Very Low
        </Badge>
      );
    }
  };

  return (
    <>
      {submission.total_tests && submission.total_tests > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {submission.test_case_score != null &&
              submission.test_case_score >= 8 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : submission.test_case_score != null &&
                submission.test_case_score >= 5 ? (
                <Clock className="h-5 w-5 text-amber-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="font-medium">
                Passed {submission.passed_tests} of {submission.total_tests}{' '}
                test cases
              </span>
            </div>
            {submission.test_case_score != null && (
              <ScoreBadge
                score={submission.test_case_score}
                maxScore={10}
                className="h-6 px-3 py-1 text-xs"
              >
                {submission.test_case_score.toFixed(2)}/10
              </ScoreBadge>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Test Case Details</h4>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground text-xs">
                    Line Numbers
                  </span>
                  <Switch
                    checked={false}
                    className="data-[state=checked]:bg-primary"
                    disabled
                  />
                </div>

                {submission.test_cases && submission.test_cases.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setExpandedTestCase(expandedTestCase ? null : 'all')
                    }
                  >
                    {expandedTestCase ? 'Collapse all' : 'Expand all'}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {submission.test_cases?.map((testcase, index) => (
                <Accordion
                  key={testcase.test_case_id ?? index}
                  type="single"
                  collapsible
                  value={
                    expandedTestCase === 'all' ? `test-${index}` : undefined
                  }
                  onValueChange={(value) => {
                    if (value === `test-${index}`) {
                      setExpandedTestCase(`test-${index}`);
                    } else if (expandedTestCase === `test-${index}`) {
                      setExpandedTestCase(null);
                    }
                  }}
                  className="w-full rounded-md border shadow-sm"
                >
                  <AccordionItem
                    value={`test-${index}`}
                    className="border-none"
                  >
                    <AccordionTrigger
                      className={`px-4 py-3 ${
                        testcase.matched
                          ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50'
                          : 'bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50'
                      } rounded-t-md`}
                    >
                      <div className="flex w-full items-center justify-between pr-2">
                        <div className="flex items-center gap-2">
                          {testcase.matched ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="font-medium text-sm">
                            Test Case {index + 1}
                          </span>

                          {testcase.confidence !== undefined &&
                            testcase.confidence !== null && (
                              <div className="ml-2 flex items-center gap-1">
                                <ThumbsUp className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground text-xs">
                                  {(testcase.confidence * 100).toFixed(0)}%
                                  confidence
                                </span>
                              </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium text-xs ${
                              testcase.matched
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            }`}
                          >
                            {testcase.matched ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-0">
                      <div className="px-4 pt-2 pb-2">
                        <div className="mb-4 rounded-md border bg-muted/20 p-3">
                          <h5 className="mb-2 font-medium text-xs">Input</h5>
                          <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 text-xs">
                            {testcase.input || 'No input provided'}
                          </pre>
                        </div>

                        {/* Test Case Reasoning */}
                        {testcase.reasoning && (
                          <div className="mb-4 rounded-md border bg-muted/20 p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <h5 className="flex items-center font-medium text-xs">
                                <Info className="mr-1 h-3.5 w-3.5 text-primary/70" />
                                Reasoning
                              </h5>

                              {testcase.confidence !== undefined && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground text-xs">
                                    Confidence:
                                  </span>
                                  {getConfidenceBadge(testcase.confidence)}
                                </div>
                              )}
                            </div>
                            <div className="rounded border bg-background p-2 text-muted-foreground text-sm">
                              {testcase.reasoning}
                            </div>
                          </div>
                        )}
                      </div>

                      <Tabs defaultValue="side-by-side" className="px-4 pb-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="font-medium text-sm">
                            Output Comparison
                          </span>
                          <TabsList>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <TabsTrigger
                                  value="side-by-side"
                                  className="h-8 w-8 p-0"
                                >
                                  <Split className="h-4 w-4" />
                                </TabsTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                Side by Side
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <TabsTrigger
                                  value="raw"
                                  className="h-8 w-8 p-0"
                                >
                                  <Code className="h-4 w-4" />
                                </TabsTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                Raw View
                              </TooltipContent>
                            </Tooltip>
                          </TabsList>
                        </div>

                        <TabsContent value="side-by-side" className="mt-0">
                          <SideBySideDiff
                            left={testcase.expected_output}
                            right={testcase.output}
                            leftTitle="Expected Output"
                            rightTitle="Your Output"
                            showLineNumbers={false}
                            className="max-h-[300px]"
                          />
                        </TabsContent>

                        <TabsContent value="raw" className="mt-0">
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <h5 className="font-medium text-muted-foreground text-xs">
                                Expected Output:
                              </h5>
                              <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 text-xs">
                                {testcase.expected_output ||
                                  'No expected output'}
                              </pre>
                            </div>

                            <div className="space-y-2">
                              <h5 className="font-medium text-muted-foreground text-xs">
                                Your Output:
                              </h5>
                              <pre
                                className={`max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md border p-2 text-xs ${
                                  testcase.matched
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                    : 'bg-red-50 dark:bg-red-900/20'
                                }`}
                              >
                                {testcase.output || 'No output produced'}
                              </pre>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ))}
            </div>
          </div>
        </div>
      ) : showSkeleton ? (
        <div className="space-y-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-6 text-center">
          <p className="text-muted-foreground text-sm">
            No test cases available
          </p>
        </div>
      )}
    </>
  );
}
