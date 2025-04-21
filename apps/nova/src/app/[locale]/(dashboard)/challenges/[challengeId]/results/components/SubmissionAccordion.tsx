import { ExtendedNovaSubmission } from '../types';
import SubmissionDetails from './SubmissionDetails';
import ScoreBadge from '@/components/common/ScoreBadge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  CheckCircle2,
  Clock,
  Code,
  Crown,
  FileText,
  TrendingUp,
  XCircle,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { formatDistanceToNow } from 'date-fns';

interface SubmissionAccordionProps {
  submissions: ExtendedNovaSubmission[];
  sessionIndex: number;
  problemIndex: number;
}

export default function SubmissionAccordion({
  submissions,
  sessionIndex,
  problemIndex,
}: SubmissionAccordionProps) {
  return (
    <Accordion
      type="single"
      collapsible
      className="mt-2 grid w-full grid-cols-1 gap-4"
    >
      {submissions.map((submission, subIndex) => {
        const createdAt = new Date(submission.created_at);
        const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true });
        const testPassRatio =
          submission.total_tests > 0
            ? submission.passed_tests / submission.total_tests
            : 0;
        const testPassPercentage = testPassRatio * 100;

        const isBest = subIndex === 0;

        // Score improvement compared to previous submission
        const prevScore =
          subIndex < submissions.length - 1
            ? submissions[subIndex + 1]?.total_score || 0
            : 0;
        const scoreImprovement = (submission.total_score || 0) - prevScore;

        return (
          <AccordionItem
            key={subIndex}
            value={`submission-${sessionIndex}-${problemIndex}-${subIndex}`}
            className="data-[state=open]:bg-muted/30 overflow-hidden rounded-lg border border-b px-0"
          >
            <AccordionTrigger
              className="hover:bg-muted/50 group gap-0 rounded-t-lg px-3 py-3"
              showChevron={false}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      isBest
                        ? 'bg-dynamic-yellow/10 text-dynamic-yellow'
                        : 'bg-muted'
                    }`}
                  >
                    {isBest ? (
                      <Crown className="h-3.5 w-3.5" />
                    ) : (
                      <Code className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex flex-col items-start text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        Submission {subIndex + 1}
                      </span>
                      {isBest && (
                        <Badge
                          variant="outline"
                          className="border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow text-xs"
                        >
                          Best
                        </Badge>
                      )}
                      {scoreImprovement > 0 &&
                        subIndex !== submissions.length - 1 && (
                          <Badge
                            variant="outline"
                            className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green text-xs"
                          >
                            <TrendingUp className="mr-1 h-3 w-3" />+
                            {scoreImprovement.toFixed(1)}
                          </Badge>
                        )}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {timeAgo}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-muted-foreground hidden items-center text-xs md:flex">
                    {submission.passed_tests}/{submission.total_tests} tests
                    passed
                    {testPassRatio >= 0.8 ? (
                      <CheckCircle2 className="text-dynamic-green ml-1 h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="text-dynamic-orange ml-1 h-3.5 w-3.5" />
                    )}
                  </div>

                  <ScoreBadge
                    score={submission.total_score}
                    maxScore={10}
                    className="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium"
                  >
                    {submission.total_score.toFixed(1)}/10
                  </ScoreBadge>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="overflow-hidden px-0 pb-0 pt-0">
              <Separator />
              <div className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center text-sm">
                    <Clock className="mr-1.5 h-4 w-4" />
                    Submitted on {createdAt.toLocaleString()}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      View Code
                    </Button>
                  </div>
                </div>

                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="mb-3 w-full">
                    <TabsTrigger value="details" className="flex-1">
                      Details
                    </TabsTrigger>
                    <TabsTrigger value="tests" className="flex-1">
                      Test Results
                    </TabsTrigger>
                    <TabsTrigger value="criteria" className="flex-1">
                      Criteria
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="details">
                    <SubmissionDetails submission={submission} />
                  </TabsContent>

                  <TabsContent value="tests">
                    <div className="rounded-md border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="font-medium">Test Results</h4>
                        <Badge
                          variant={testPassRatio >= 0.8 ? 'success' : 'warning'}
                        >
                          {testPassPercentage.toFixed(0)}% Passed
                        </Badge>
                      </div>

                      <div className="text-muted-foreground space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span>Total Tests:</span>
                          <span className="font-medium">
                            {submission.total_tests}
                          </span>
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
                  </TabsContent>

                  <TabsContent value="criteria">
                    <div className="rounded-md border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="font-medium">Evaluation Criteria</h4>
                        <Badge>
                          {submission.criteria_score.toFixed(1)} points
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {submission.criteria.map((criterion, index) => (
                          <div key={index} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {criterion.name}
                              </span>
                              <Badge variant="outline">
                                {criterion.result?.score.toFixed(1)}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-xs">
                              {criterion.description}
                            </p>
                            {criterion.result?.feedback && (
                              <div className="bg-muted/50 rounded-sm p-2 text-xs">
                                {criterion.result.feedback}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
