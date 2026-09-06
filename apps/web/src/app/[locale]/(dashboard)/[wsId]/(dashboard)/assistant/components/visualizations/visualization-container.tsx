'use client';

import { Maximize2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useVisualizationStore } from '../../stores/visualization-store';
import type { Visualization } from '../../types/visualizations';
import { AssigneeTasksCard } from './assignee-tasks-card';
import { CoreMentionCard } from './core-mention-card';
import { GoogleSearchCard } from './google-search-card';
import { MembersCard } from './members-card';
import { StatusChart } from './status-chart';
import { TaskDetailView } from './task-detail-view';
import { TaskListCard } from './task-list-card';
import { TimelineView } from './timeline-view';

// Renders visualization content based on type - reusable for normal and fullscreen views
function VisualizationContent({
  vis,
  isFullscreen = false,
  wsId,
}: {
  vis: Visualization;
  isFullscreen?: boolean;
  wsId?: string;
}) {
  return (
    <>
      {vis.type === 'task_list' && (
        <TaskListCard data={vis.data} isFullscreen={isFullscreen} wsId={wsId} />
      )}
      {vis.type === 'gantt_timeline' && (
        <TimelineView data={vis.data} isFullscreen={isFullscreen} wsId={wsId} />
      )}
      {vis.type === 'status_distribution' && (
        <StatusChart data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'task_detail' && (
        <TaskDetailView
          data={vis.data}
          isFullscreen={isFullscreen}
          wsId={wsId}
        />
      )}
      {vis.type === 'google_search' && (
        <GoogleSearchCard data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'workspace_members' && (
        <MembersCard data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'assignee_tasks' && (
        <AssigneeTasksCard
          data={vis.data}
          isFullscreen={isFullscreen}
          wsId={wsId}
        />
      )}
    </>
  );
}

export function VisualizationContainer({ wsId }: { wsId?: string }) {
  const t = useTranslations('dashboard.voice_assistant.studio');
  const {
    visualizations,
    centerVisualization,
    removeVisualization,
    removeCenterVisualization,
  } = useVisualizationStore();
  const [expanded, setExpanded] = useState<Visualization | null>(null);
  const visible = visualizations.filter((vis) => !vis.dismissed);
  return (
    <div className="space-y-3">
      {centerVisualization?.type === 'core_mention' &&
        !centerVisualization.dismissed && (
          <CoreMentionCard
            data={centerVisualization.data}
            onDismiss={removeCenterVisualization}
          />
        )}
      {!visible.length && !centerVisualization && (
        <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
          {t('results_empty')}
        </div>
      )}
      {visible.map((vis) => (
        <Card key={vis.id} className="relative overflow-hidden">
          <div className="flex justify-end gap-1 border-b p-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t('expand')}
              onClick={() => setExpanded(vis)}
            >
              <Maximize2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t('dismiss')}
              onClick={() => removeVisualization(vis.id)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <VisualizationContent vis={vis} wsId={wsId} />
        </Card>
      ))}
      <Dialog
        open={expanded !== null}
        onOpenChange={(open) => {
          if (!open) setExpanded(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('results')}</DialogTitle>
          </DialogHeader>
          {expanded && (
            <VisualizationContent vis={expanded} isFullscreen wsId={wsId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
