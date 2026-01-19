import {
  Box,
  FileText,
  Image as ImageIcon,
  Link2,
  Play,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionMetadata } from '@tuturuuu/utils/text-helper';
import { memo } from 'react';
import { TaskEstimationDisplay } from '../../../shared/task-estimation-display';
import { TaskLabelsDisplay } from '../../../shared/task-labels-display';
import { getPriorityIndicator } from '../../../utils/taskPriorityUtils';

interface TaskCardMetadataProps {
  task: Task;
  taskList?: TaskList;
  estimationType?: string;
  /** Localized label for "Hidden Labels" tooltip. Passed to TaskLabelsDisplay. */
  hiddenLabelsLabel?: string;
}

export const TaskCardMetadata = memo(function TaskCardMetadata({
  task,
  taskList,
  estimationType,
  hiddenLabelsLabel,
}: TaskCardMetadataProps) {
  const descriptionMeta = getDescriptionMetadata(task.description);

  // Hide metadata when in done/closed list
  if (taskList?.status === 'done' || taskList?.status === 'closed') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="scrollbar-hide flex w-full min-w-0 items-center gap-1 overflow-auto whitespace-nowrap rounded-lg">
        {/* Priority */}
        {!task.closed_at && task.priority && (
          <div className="flex-none overflow-hidden">
            {getPriorityIndicator(task.priority)}
          </div>
        )}

        {/* Project indicator */}
        {!task.closed_at && task.projects && task.projects.length > 0 && (
          <div className="min-w-0 shrink-0">
            <Badge
              variant="secondary"
              className={cn(
                'h-5 border px-2 text-[10px]',
                'border-dynamic-sky/30 bg-dynamic-sky/10 text-dynamic-sky'
              )}
            >
              <Box className="h-2.5 w-2.5" />
              {task.projects.length === 1
                ? task.projects[0]?.name
                : `${task.projects.length} projects`}
            </Badge>
          </div>
        )}

        {/* Estimation Points */}
        {!task.closed_at && task.estimation_points && (
          <div className="min-w-0 shrink-0">
            <TaskEstimationDisplay
              points={task.estimation_points}
              size="sm"
              estimationType={estimationType}
              showIcon
            />
          </div>
        )}

        {/* Labels */}
        {!task.closed_at && task.labels && task.labels.length > 0 && (
          <div className="flex min-w-0 shrink-0 flex-wrap gap-1">
            {/* Sort labels for deterministic display order */}
            <TaskLabelsDisplay
              labels={[...task.labels].sort((a, b) =>
                a.name.toLowerCase().localeCompare(b.name.toLowerCase())
              )}
              size="sm"
              hiddenLabelsLabel={hiddenLabelsLabel}
            />
          </div>
        )}

        {/* Description indicators */}
        {!task.closed_at &&
          (descriptionMeta.hasText ||
            descriptionMeta.hasImages ||
            descriptionMeta.hasVideos ||
            descriptionMeta.hasLinks) && (
            <div className="flex min-w-0 shrink-0 items-center gap-0.5">
              {descriptionMeta.hasText && (
                <div
                  className="flex items-center gap-0.5 rounded bg-dynamic-surface/50 py-0.5"
                  title="Has description"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
              {descriptionMeta.hasImages && (
                <div
                  className="flex items-center gap-0.5 rounded bg-dynamic-surface/50 py-0.5"
                  title={`${descriptionMeta.imageCount} image${descriptionMeta.imageCount > 1 ? 's' : ''}`}
                >
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {descriptionMeta.imageCount > 1 && (
                    <span className="text-[9px] text-muted-foreground">
                      {descriptionMeta.imageCount}
                    </span>
                  )}
                </div>
              )}
              {descriptionMeta.hasVideos && (
                <div
                  className="flex items-center gap-0.5 rounded bg-dynamic-surface/50 py-0.5"
                  title={`${descriptionMeta.videoCount} video${descriptionMeta.videoCount > 1 ? 's' : ''}`}
                >
                  <Play className="h-3.5 w-3.5 text-muted-foreground" />
                  {descriptionMeta.videoCount > 1 && (
                    <span className="text-[9px] text-muted-foreground">
                      {descriptionMeta.videoCount}
                    </span>
                  )}
                </div>
              )}
              {descriptionMeta.hasLinks && (
                <div
                  className="flex items-center gap-0.5 rounded bg-dynamic-surface/50 px-1 py-0.5"
                  title={`${descriptionMeta.linkCount} link${descriptionMeta.linkCount > 1 ? 's' : ''}`}
                >
                  <Link2 className="h-2.5 w-2.5 text-muted-foreground" />
                  {descriptionMeta.linkCount > 1 && (
                    <span className="text-[9px] text-muted-foreground">
                      {descriptionMeta.linkCount}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );
});
