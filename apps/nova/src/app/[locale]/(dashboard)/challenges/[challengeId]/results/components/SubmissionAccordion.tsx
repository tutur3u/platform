import { ExtendedNovaSubmission } from '../types';
import SubmissionDetails from './SubmissionDetails';
import ScoreBadge from '@/components/common/ScoreBadge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Clock } from '@tuturuuu/ui/icons';

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
    <Accordion type="single" collapsible className="w-full">
      {submissions.map((submission, subIndex) => (
        <AccordionItem
          key={subIndex}
          value={`submission-${sessionIndex}-${problemIndex}-${subIndex}`}
        >
          <AccordionTrigger className="hover:bg-muted/50 rounded-lg px-4">
            <div className="flex flex-1 justify-between">
              <div className="flex items-center">
                <span className="font-medium">Submission {subIndex + 1}</span>
                {subIndex === 0 && (
                  <div className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                    Best
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <Clock className="text-muted-foreground mr-1 h-4 w-4" />
                  <span className="text-muted-foreground text-sm">
                    {new Date(submission.created_at).toLocaleString()}
                  </span>
                </div>
                <ScoreBadge
                  score={submission.total_score}
                  maxScore={10}
                  className="inline-flex items-center justify-center rounded-full px-2 py-1.5 font-medium"
                >
                  {submission.total_score.toFixed(2)}/10
                </ScoreBadge>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <SubmissionDetails submission={submission} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
