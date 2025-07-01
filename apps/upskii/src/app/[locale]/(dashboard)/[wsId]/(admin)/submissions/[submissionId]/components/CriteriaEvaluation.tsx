'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { ExtendedNovaSubmission } from '../types';

interface CriteriaEvaluationProps {
  submission: ExtendedNovaSubmission;
}

export default function CriteriaEvaluation({
  submission,
}: CriteriaEvaluationProps) {
  if (!submission.criteria || submission.criteria.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <p className="text-muted-foreground">No criteria available</p>
      </div>
    );
  }

  // Sort criteria by score (highest first)
  const sortedCriteria = [...submission.criteria].sort(
    (a, b) => (b.result?.score || 0) - (a.result?.score || 0)
  );

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-medium">Criteria Evaluation</h3>
          <p className="text-sm text-muted-foreground">
            {submission.sum_criterion_score.toFixed(1)} of{' '}
            {submission.total_criteria * 10} possible points
          </p>
        </div>
        <Badge variant="secondary">
          {submission.criteria_score.toFixed(1)}/10 Score
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {sortedCriteria.map((criterion) => (
          <Card key={criterion.id} className="overflow-hidden">
            <div
              className="h-2 w-full"
              style={{
                background: `linear-gradient(90deg, 
                  hsl(var(--success)) 0%, 
                  hsl(var(--success)) ${(criterion.result?.score || 0) * 10}%, 
                  hsl(var(--muted)) ${(criterion.result?.score || 0) * 10}%, 
                  hsl(var(--muted)) 100%)`,
              }}
            />
            <CardHeader className="pb-2">
              <div className="flex justify-between">
                <CardTitle className="text-base">{criterion.name}</CardTitle>
                <Badge variant="outline">
                  {criterion.result?.score.toFixed(1) || 0}/10
                </Badge>
              </div>
              <CardDescription>{criterion.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {criterion.result?.feedback ? (
                <div className="text-sm">
                  <h4 className="mb-1 font-semibold">Feedback:</h4>
                  <p className="text-muted-foreground">
                    {criterion.result.feedback}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No feedback provided
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
