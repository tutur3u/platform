import { CheckCircle2, Clock, EyeIcon, XCircle } from '@tuturuuu/icons';
import type { NovaSubmissionData } from '@tuturuuu/types';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import ScoreBadge from '@/components/common/ScoreBadge';

interface CriteriaEvaluationProps {
  submission: Partial<NovaSubmissionData>;
  showSkeleton: boolean;
}

export default function CriteriaEvaluation({
  submission,
  showSkeleton,
}: CriteriaEvaluationProps) {
  return (
    <>
      {submission.total_criteria && submission.total_criteria > 0 ? (
        <div className="space-y-6">
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
                className="h-6 px-3 py-1 text-xs"
              >
                {submission.criteria_score.toFixed(2)}/10
              </ScoreBadge>
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
                          <span className="block font-medium text-sm">
                            {cs.name}
                          </span>
                          <span className="block text-muted-foreground text-xs">
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
    </>
  );
}
