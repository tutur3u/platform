import { ExtendedNovaSubmission } from './actions';
import ScoreBadge from '@/components/common/ScoreBadge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { CheckCircle2, Clock, XCircle } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';

interface SubmissionCardProps {
  submission: ExtendedNovaSubmission;
}

export function SubmissionCard({ submission }: SubmissionCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            <Clock className="mr-1 inline h-3 w-3" />
            {new Date(submission.created_at).toLocaleString()}
          </span>

          <ScoreBadge
            score={submission.total_score}
            maxScore={10}
            className="px-2 py-0"
          >
            {submission.total_score.toFixed(2)}/10
          </ScoreBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-foreground mb-1 text-sm font-medium">Prompt:</h3>
          <div className="bg-muted rounded-md p-2 text-sm">
            {submission.prompt}
          </div>
        </div>

        {/* Overall Assessment - moved to top for better visibility */}
        {submission.overall_assessment && (
          <div className="space-y-2">
            <h3 className="text-foreground mb-1 text-sm font-medium">
              Overall Assessment:
            </h3>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
              <p className="text-sm">{submission.overall_assessment}</p>
            </div>
          </div>
        )}

        {/* Test Case Evaluation */}
        {submission.total_tests > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium">
                Test Case Evaluation:
              </h3>
              <ScoreBadge
                score={submission.test_case_score}
                maxScore={10}
                className="px-2 py-0"
              >
                {submission.test_case_score.toFixed(2)}/10
              </ScoreBadge>
            </div>
            <div className="space-y-2 rounded-md border p-4">
              <div>
                <span className="text-sm">
                  Passed {submission.passed_tests} of {submission.total_tests}{' '}
                  test cases
                </span>
              </div>
              <Progress
                value={(submission.passed_tests / submission.total_tests) * 100}
                className="h-2 w-full"
                indicatorClassName={
                  submission.test_case_score >= 8
                    ? 'bg-emerald-500'
                    : submission.test_case_score >= 5
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }
              />

              {/* Detailed Test Cases */}
              <div className="mt-4">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="test-cases">
                    <AccordionTrigger className="text-sm font-medium">
                      View Test Case Details
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        {submission.test_cases.map((testcase, index) => (
                          <div
                            key={testcase.id ?? index}
                            className={`rounded-md border p-3 ${
                              testcase.result?.matched
                                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                                : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-sm font-medium">
                                Test Case {index + 1}
                              </span>
                              <div className="flex items-center">
                                {testcase.result?.matched ? (
                                  <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-500" />
                                ) : (
                                  <XCircle className="mr-1 h-4 w-4 text-red-500" />
                                )}
                                <span
                                  className={`text-xs font-medium ${
                                    testcase.result?.matched
                                      ? 'text-emerald-500'
                                      : 'text-red-500'
                                  }`}
                                >
                                  {testcase.result?.matched ? 'PASS' : 'FAIL'}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                              <div className="space-y-1">
                                <p className="font-medium">Input:</p>
                                <pre className="bg-background max-h-24 overflow-auto whitespace-pre-wrap rounded p-2">
                                  {testcase.input}
                                </pre>
                              </div>

                              <div className="space-y-1">
                                <p className="font-medium">Expected Output:</p>
                                <pre className="bg-background max-h-24 overflow-auto whitespace-pre-wrap rounded p-2">
                                  {testcase.output}
                                </pre>
                              </div>

                              <div className="space-y-1 md:col-span-2">
                                <p className="font-medium">Your Output:</p>
                                <pre
                                  className={`max-h-24 overflow-auto whitespace-pre-wrap rounded p-2 ${
                                    testcase.result?.matched
                                      ? 'bg-emerald-100 dark:bg-emerald-900/20'
                                      : 'bg-red-100 dark:bg-red-900/20'
                                  }`}
                                >
                                  {testcase.result?.output ||
                                    'No output produced'}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
          </div>
        )}

        {/* Criteria Evaluation */}
        {submission.total_criteria > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium">
                Criteria Evaluation:
              </h3>
              <ScoreBadge
                score={submission.criteria_score}
                maxScore={10}
                className="px-2 py-0"
              >
                {submission.criteria_score.toFixed(2)}/10
              </ScoreBadge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {submission.criteria?.map((cs) => {
                if (!cs) return null;

                return (
                  <HoverCard key={cs.result.criteria_id}>
                    <HoverCardTrigger asChild>
                      <div
                        className={`flex cursor-pointer items-center justify-between rounded-md border p-2 ${
                          cs.result.score >= 8
                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                            : cs.result.score >= 5
                              ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                              : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {cs.result.score >= 8 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : cs.result.score >= 5 ? (
                            <Clock className="h-4 w-4 text-amber-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">{cs.name}</span>
                        </div>
                        <ScoreBadge score={cs.result.score} maxScore={10}>
                          {cs.result.score}/10
                        </ScoreBadge>
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80 p-4">
                      <div className="space-y-2">
                        <h4 className="font-medium">Feedback</h4>
                        <p className="text-muted-foreground text-sm">
                          {cs.result.feedback}
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
