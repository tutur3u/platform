'use client';

import type { NovaSubmissionData } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';

interface CriteriaEvaluationProps {
  submission: NovaSubmissionData;
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

  // Sort criteria by score (highest first) with proper null handling
  const sortedCriteria = submission.criteria.sort((a, b) => {
    const scoreA = a.score;
    const scoreB = b.score;
    return scoreB - scoreA;
  });

  const sumCriterionScore = submission.sum_criterion_score || 0;
  const totalCriteria = submission.total_criteria || 1;
  const criteriaScore = submission.criteria_score || 0;

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-medium">Criteria Evaluation</h3>
          <p className="text-muted-foreground text-sm">
            {sumCriterionScore.toFixed(1)} of {totalCriteria * 10} possible
            points
          </p>
        </div>
        <Badge variant="secondary">{criteriaScore.toFixed(1)}/10 Score</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {sortedCriteria.map((criterion) => {
          const criterionScore = criterion.score ?? 0;
          const criterionFeedback = criterion.feedback || '';

          return (
            <Card key={criterion.criteria_id} className="overflow-hidden">
              <div
                className="h-2 w-full"
                style={{
                  background: `linear-gradient(90deg, 
                    hsl(var(--success)) 0%, 
                    hsl(var(--success)) ${criterionScore * 10}%, 
                    hsl(var(--muted)) ${criterionScore * 10}%, 
                    hsl(var(--muted)) 100%)`,
                }}
              />
              <CardHeader className="pb-2">
                <div className="flex justify-between">
                  <CardTitle className="text-base">
                    {
                      submission.criteria.find(
                        (c) => c.criteria_id === criterion.criteria_id
                      )?.name
                    }
                  </CardTitle>
                  <Badge variant="outline">
                    {criterionScore.toFixed(1)}/10
                  </Badge>
                </div>
                <CardDescription>{criterion.description || ''}</CardDescription>
              </CardHeader>
              <Separator className="my-2" />
              <CardContent>
                {criterionFeedback ? (
                  <div className="text-sm">
                    <h4 className="mb-1 font-semibold">Feedback:</h4>
                    <p className="text-muted-foreground">{criterionFeedback}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    No feedback provided
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
