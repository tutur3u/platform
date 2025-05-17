import OutputDiff from '@/components/common/OutputDiff';
import ScoreBadge from '@/components/common/ScoreBadge';
import SideBySideDiff from '@/components/common/SideBySideDiff';
import { NovaSubmissionData } from '@tuturuuu/types/db';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import {
  CheckCircle2,
  Clock,
  Code,
  Compass,
  EyeIcon,
  FileCode,
  Info,
  Loader2,
  RefreshCw,
  Split,
  TextCursor,
  ThumbsUp,
  User,
  XCircle,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useEffect, useState } from 'react';

interface SubmissionCardProps {
  submission: Partial<NovaSubmissionData>;
  isCurrent: boolean;
  onRequestFetch?: (submissionId: string) => void;
  isLoading?: boolean;
  queuePosition?: number;
}

export function SubmissionCard({
  submission,
  isCurrent,
  onRequestFetch,
  isLoading = false,
  queuePosition,
}: SubmissionCardProps) {
  const [activeTab, setActiveTab] = useState<string>('test-cases');
  const [expandedTestCase, setExpandedTestCase] = useState<string | null>(null);

  useEffect(() => {
    // Only request fetch if we don't already have the full data
    if (!submission.id || submission.criteria || !onRequestFetch) return;
    onRequestFetch(submission.id);
  }, [submission.id, submission.criteria, onRequestFetch]);

  const isDetailsFetched = !!submission.criteria || !!submission.test_cases;
  const showSkeleton = isLoading && !isDetailsFetched;

  // Calculate progress color based on score
  const getProgressColor = (score: number) => {
    if (score >= 8) return 'bg-emerald-500';
    if (score >= 5) return 'bg-amber-500';
    return 'bg-red-500';
  };

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
    <Card
      key={submission.id}
      className={`overflow-hidden transition-all duration-200 ${isCurrent ? 'border-primary/50 shadow-md' : 'border-muted-foreground/20'} ${showSkeleton ? 'opacity-90' : ''}`}
    >
      <CardHeader className="pb-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {submission.created_at && (
              <Badge variant="outline" className="text-xs">
                <Clock className="mr-1 inline h-3 w-3" />
                {new Date(submission.created_at).toLocaleString()}
              </Badge>
            )}

            {!isCurrent && (
              <Badge variant="outline" className="text-xs">
                <User className="mr-1 h-3 w-3" />
                Past Session
              </Badge>
            )}

            {isLoading && (
              <Badge variant="secondary" className="animate-pulse text-xs">
                {queuePosition === 0 ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Loading details...
                  </>
                ) : (
                  <>
                    <Clock className="mr-1 h-3 w-3" />
                    Queued {queuePosition ? `(${queuePosition})` : ''}
                  </>
                )}
              </Badge>
            )}

            {!isLoading && !isDetailsFetched && submission.id && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => onRequestFetch?.(submission.id!)}
              >
                <RefreshCw className="h-3 w-3" />
                Load details
              </Button>
            )}
          </div>

          {submission.total_score != null ? (
            <ScoreBadge
              score={submission.total_score}
              maxScore={10}
              className="h-8 px-3 py-1 text-sm font-semibold"
            >
              {submission.total_score.toFixed(2)}/10
            </ScoreBadge>
          ) : (
            showSkeleton && <Skeleton className="h-8 w-20" />
          )}
        </div>
      </CardHeader>

      <CardContent
        className={`space-y-6 ${showSkeleton ? 'animate-pulse' : ''}`}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileCode className="text-primary/70 h-4 w-4" />
            <h3 className="text-foreground text-sm font-medium">Prompt</h3>
          </div>
          <div className="bg-muted/50 whitespace-pre-line rounded-md border p-3 text-sm">
            {submission.prompt ||
              (showSkeleton && <Skeleton className="h-16 w-full" />)}
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList className="w-full">
            <TabsTrigger value="test-cases" className="flex-1">
              <div className="flex items-center gap-1">
                <Code className="h-4 w-4" />
                <span>Test Cases</span>
              </div>
              {submission.test_case_score != null && (
                <span className="ml-2 inline-block">
                  <ScoreBadge
                    score={submission.test_case_score}
                    maxScore={10}
                    className="px-1.5 py-0 text-xs"
                  >
                    {submission.test_case_score.toFixed(1)}
                  </ScoreBadge>
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="criteria" className="flex-1">
              <div className="flex items-center gap-1">
                <Compass className="h-4 w-4" />
                <span>Criteria</span>
              </div>
              {submission.criteria_score != null && (
                <span className="ml-2 inline-block">
                  <ScoreBadge
                    score={submission.criteria_score}
                    maxScore={10}
                    className="px-1.5 py-0 text-xs"
                  >
                    {submission.criteria_score.toFixed(1)}
                  </ScoreBadge>
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Test Cases Tab */}
          <TabsContent value="test-cases" className="space-y-4 pt-2">
            {submission.total_tests && submission.total_tests > 0 ? (
              <div className="space-y-4">
                <div className="bg-card space-y-2 rounded-md border p-4">
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
                        Passed {submission.passed_tests} of{' '}
                        {submission.total_tests} test cases
                      </span>
                    </div>
                    {submission.test_case_score != null && (
                      <ScoreBadge
                        score={submission.test_case_score}
                        maxScore={10}
                        className="px-2 py-0"
                      >
                        {submission.test_case_score.toFixed(2)}/10
                      </ScoreBadge>
                    )}
                  </div>

                  {submission.passed_tests != null &&
                    submission.total_tests != null && (
                      <div className="pt-1">
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            Progress
                          </span>
                          <span className="font-medium">
                            {Math.round(
                              (submission.passed_tests /
                                submission.total_tests) *
                                100
                            )}
                            %
                          </span>
                        </div>
                        <Progress
                          value={
                            (submission.passed_tests / submission.total_tests) *
                            100
                          }
                          className="h-2 w-full"
                          indicatorClassName={
                            submission.test_case_score != null
                              ? getProgressColor(submission.test_case_score)
                              : 'bg-primary'
                          }
                        />
                      </div>
                    )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Test Case Details</h4>

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

                      {submission.test_cases &&
                        submission.test_cases.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              setExpandedTestCase(
                                expandedTestCase ? null : 'all'
                              )
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
                          expandedTestCase === 'all'
                            ? `test-${index}`
                            : undefined
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
                                <span className="text-sm font-medium">
                                  Test Case {index + 1}
                                </span>

                                {testcase.confidence !== undefined &&
                                  testcase.confidence !== null && (
                                    <div className="ml-2 flex items-center gap-1">
                                      <ThumbsUp className="text-muted-foreground h-3 w-3" />
                                      <span className="text-muted-foreground text-xs">
                                        {(testcase.confidence * 100).toFixed(0)}
                                        % confidence
                                      </span>
                                    </div>
                                  )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
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
                            <div className="px-4 pb-2 pt-2">
                              <div className="bg-muted/20 mb-4 rounded-md border p-3">
                                <h5 className="mb-2 text-xs font-medium">
                                  Input
                                </h5>
                                <pre className="bg-background max-h-24 overflow-auto whitespace-pre-wrap rounded-md border p-2 text-xs">
                                  {testcase.input || 'No input provided'}
                                </pre>
                              </div>

                              {/* Test Case Reasoning */}
                              {testcase.reasoning && (
                                <div className="bg-muted/20 mb-4 rounded-md border p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <h5 className="flex items-center text-xs font-medium">
                                      <Info className="text-primary/70 mr-1 h-3.5 w-3.5" />
                                      Reasoning
                                    </h5>

                                    {testcase.confidence !== undefined && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground text-xs">
                                          Confidence:
                                        </span>
                                        {getConfidenceBadge(
                                          testcase.confidence
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="bg-background text-muted-foreground rounded border p-2 text-sm">
                                    {testcase.reasoning}
                                  </div>
                                </div>
                              )}
                            </div>

                            <Tabs
                              defaultValue="side-by-side"
                              className="px-4 pb-4"
                            >
                              <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-medium">
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
                                        value="inline"
                                        className="h-8 w-8 p-0"
                                      >
                                        <TextCursor className="h-4 w-4" />
                                      </TabsTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      Inline Diff
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

                              <TabsContent
                                value="side-by-side"
                                className="mt-0"
                              >
                                <SideBySideDiff
                                  left={testcase.expected_output || ''}
                                  right={testcase.output || ''}
                                  leftTitle="Expected Output"
                                  rightTitle="Your Output"
                                  showLineNumbers={false}
                                  className="max-h-[300px] overflow-auto"
                                />
                              </TabsContent>

                              <TabsContent value="inline" className="mt-0">
                                <div className="space-y-2">
                                  <OutputDiff
                                    expected={testcase.expected_output || ''}
                                    actual={testcase.output || ''}
                                    className="max-h-[300px]"
                                  />
                                </div>
                              </TabsContent>

                              <TabsContent value="raw" className="mt-0">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <h5 className="text-muted-foreground text-xs font-medium">
                                      Expected Output:
                                    </h5>
                                    <pre className="bg-background max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md border p-2 text-xs">
                                      {testcase.expected_output ||
                                        'No expected output'}
                                    </pre>
                                  </div>

                                  <div className="space-y-2">
                                    <h5 className="text-muted-foreground text-xs font-medium">
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
          </TabsContent>

          {/* Criteria Tab */}
          <TabsContent value="criteria" className="space-y-4 pt-2">
            {submission.total_criteria && submission.total_criteria > 0 ? (
              <div className="space-y-4">
                <div className="bg-card rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {submission.criteria_score != null &&
                      submission.criteria_score >= 8 ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : submission.criteria_score != null &&
                        submission.criteria_score >= 5 ? (
                        <Clock className="h-5 w-5 text-amber-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="font-medium">
                        {submission.criteria?.length} Evaluation Criteria
                      </span>
                    </div>
                    {submission.criteria_score != null && (
                      <ScoreBadge
                        score={submission.criteria_score}
                        maxScore={10}
                        className="px-2 py-0"
                      >
                        {submission.criteria_score.toFixed(2)}/10
                      </ScoreBadge>
                    )}
                  </div>

                  {submission.criteria_score != null && (
                    <div className="pt-1">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          Overall score
                        </span>
                        <span className="font-medium">
                          {Math.round((submission.criteria_score / 10) * 100)}%
                        </span>
                      </div>
                      <Progress
                        value={(submission.criteria_score / 10) * 100}
                        className="h-2 w-full"
                        indicatorClassName={getProgressColor(
                          submission.criteria_score
                        )}
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {submission.criteria?.map((cs) => {
                    if (!cs) return null;

                    return (
                      <HoverCard key={cs.criteria_id} openDelay={100}>
                        <HoverCardTrigger asChild>
                          <div
                            className={`flex cursor-pointer items-center justify-between rounded-md border p-3 transition-all hover:shadow-sm ${
                              cs.score >= 8
                                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                                : cs.score >= 5
                                  ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                                  : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {cs.score >= 8 ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : cs.score >= 5 ? (
                                <Clock className="h-4 w-4 text-amber-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              <div>
                                <span className="block text-sm font-medium">
                                  {cs.name}
                                </span>
                                <span className="text-muted-foreground block text-xs">
                                  <EyeIcon className="mr-1 inline-block h-3 w-3" />
                                  Hover for feedback
                                </span>
                              </div>
                            </div>
                            <ScoreBadge
                              score={cs.score}
                              maxScore={10}
                              className="text-xs"
                            >
                              {cs.score}/10
                            </ScoreBadge>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80 p-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{cs.name}</h4>
                              <ScoreBadge
                                score={cs.score}
                                maxScore={10}
                                className="text-xs"
                              >
                                {cs.score}/10
                              </ScoreBadge>
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {cs.feedback}
                            </p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    );
                  })}
                </div>
              </div>
            ) : showSkeleton ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-full" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-muted-foreground text-sm">
                  No criteria evaluation available
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
