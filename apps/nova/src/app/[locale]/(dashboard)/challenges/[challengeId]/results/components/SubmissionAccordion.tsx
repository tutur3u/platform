import { ExtendedNovaSubmission } from '../types';
import CriteriaEvaluation from './CriteriaEvaluation';
import SubmissionDetails from './SubmissionDetails';
import TestCaseEvaluation from './TestCaseEvaluation';
import ScoreBadge from '@/components/common/ScoreBadge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { CheckCircle2, Clock, Code, Crown, XCircle } from '@tuturuuu/ui/icons';
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

        const isBest = subIndex === 0;

        return (
          <AccordionItem
            key={subIndex}
            value={`submission-${sessionIndex}-${problemIndex}-${subIndex}`}
            className="overflow-hidden rounded-lg border border-b px-0 data-[state=open]:bg-muted/30"
          >
            <AccordionTrigger
              className="group gap-0 rounded-t-lg px-3 py-3 hover:bg-muted/50"
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
                          className="border-dynamic-yellow/20 bg-dynamic-yellow/10 text-xs text-dynamic-yellow"
                        >
                          Best
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden items-center text-xs text-muted-foreground md:flex">
                    {submission.passed_tests}/{submission.total_tests} tests
                    passed
                    {testPassRatio >= 0.8 ? (
                      <CheckCircle2 className="ml-1 h-3.5 w-3.5 text-dynamic-green" />
                    ) : (
                      <XCircle className="ml-1 h-3.5 w-3.5 text-dynamic-orange" />
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
            <AccordionContent className="overflow-hidden px-0 pt-0 pb-0">
              <Separator />
              <div className="p-4">
                <div className="mb-4 flex items-center text-sm text-muted-foreground">
                  <Clock className="mr-1.5 h-4 w-4" />
                  Submitted on {createdAt.toLocaleString()}
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
                    <TestCaseEvaluation submission={submission} />
                  </TabsContent>

                  <TabsContent value="criteria">
                    <CriteriaEvaluation submission={submission} />
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
