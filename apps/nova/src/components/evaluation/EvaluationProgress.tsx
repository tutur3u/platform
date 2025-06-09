'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { AlertCircle, CheckCircle, Clock } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';

interface EvaluationStage {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  progress?: number;
  message?: string;
  error?: string;
}

interface EvaluationProgressProps {
  stages: EvaluationStage[];
  overall_progress: number;
  current_stage?: string;
  isComplete?: boolean;
  error?: string;
}

const stageIcons = {
  pending: Clock,
  active: Clock,
  complete: CheckCircle,
  error: AlertCircle,
};

const stageColors = {
  pending: 'text-muted-foreground',
  active: 'text-blue-500',
  complete: 'text-green-500',
  error: 'text-red-500',
};

export function EvaluationProgress({
  stages,
  overall_progress,
  current_stage,
  isComplete = false,
  error,
}: EvaluationProgressProps) {
  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {isComplete ? 'Evaluation Complete' : 'Evaluating Prompt...'}
          </h3>
          <span className="text-sm text-muted-foreground">
            {Math.round(overall_progress)}%
          </span>
        </div>
        <Progress value={overall_progress} className="h-2" />
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </div>

      {/* Individual Stages */}
      <div className="space-y-3">
        {stages.map((stage) => {
          const Icon = stageIcons[stage.status];
          const isActive = stage.id === current_stage;

          return (
            <div
              key={stage.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 transition-all',
                isActive ? 'border-blue-200 bg-blue-50' : 'bg-muted/50',
                stage.status === 'error' && 'border-red-200 bg-red-50'
              )}
            >
              <div className="mt-0.5 flex-shrink-0">
                <Icon
                  className={cn(
                    'h-4 w-4',
                    stageColors[stage.status],
                    isActive && 'animate-pulse'
                  )}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium">{stage.name}</p>
                  <Badge
                    variant={
                      stage.status === 'complete'
                        ? 'default'
                        : stage.status === 'active'
                          ? 'secondary'
                          : stage.status === 'error'
                            ? 'destructive'
                            : 'outline'
                    }
                    className="ml-2"
                  >
                    {stage.status === 'active'
                      ? 'In Progress'
                      : stage.status === 'complete'
                        ? 'Complete'
                        : stage.status === 'error'
                          ? 'Error'
                          : 'Pending'}
                  </Badge>
                </div>

                <p className="mb-2 text-sm text-muted-foreground">
                  {stage.description}
                </p>

                {stage.message && (
                  <p className="mb-2 text-sm text-blue-600">{stage.message}</p>
                )}

                {stage.error && (
                  <p className="mb-2 text-sm text-red-600">{stage.error}</p>
                )}

                {stage.status === 'active' && stage.progress !== undefined && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.round(stage.progress)}%</span>
                    </div>
                    <Progress value={stage.progress} className="h-1" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EvaluationProgress;
