import { ExtendedNovaSubmission } from '../types';
import ScoreBadge from '@/components/common/ScoreBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Fragment } from 'react';

interface CriteriaEvaluationProps {
  submission: ExtendedNovaSubmission;
}

export default function CriteriaEvaluation({
  submission,
}: CriteriaEvaluationProps) {
  return (
    <>
      {submission.criteria.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Criteria Score</span>
            <ScoreBadge
              score={submission.criteria_score}
              maxScore={10}
              className="px-2 py-0"
            >
              {submission.criteria_score.toFixed(2)}/10
            </ScoreBadge>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submission.criteria.map((criterion, idx) => (
                  <Fragment key={idx}>
                    <TableRow>
                      <TableCell className="font-medium">
                        {criterion.name}
                      </TableCell>
                      <TableCell>{criterion.description}</TableCell>
                      <TableCell className="text-right">
                        <ScoreBadge
                          score={criterion.result.score}
                          maxScore={10}
                          className="inline-flex items-center justify-center rounded-full px-2 py-1.5 font-medium"
                        >
                          {criterion.result.score.toFixed(2)}/10
                        </ScoreBadge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="space-y-3">
                        <h4 className="mb-2 text-sm font-medium">
                          Detailed Feedback
                        </h4>
                        <div className="bg-muted rounded-lg p-3">
                          <div className="whitespace-pre-wrap text-sm">
                            {criterion.result.feedback}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground py-4 text-center">
          No evaluation criteria available
        </div>
      )}
    </>
  );
}
