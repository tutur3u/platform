'use client';

import { Maximize2, Minimize2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { AnimatePresence, motion } from 'framer-motion';
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
}: {
  vis: Visualization;
  isFullscreen?: boolean;
}) {
  return (
    <>
      {vis.type === 'task_list' && (
        <TaskListCard data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'gantt_timeline' && (
        <TimelineView data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'status_distribution' && (
        <StatusChart data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'task_detail' && (
        <TaskDetailView data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'google_search' && (
        <GoogleSearchCard data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'workspace_members' && (
        <MembersCard data={vis.data} isFullscreen={isFullscreen} />
      )}
      {vis.type === 'assignee_tasks' && (
        <AssigneeTasksCard data={vis.data} isFullscreen={isFullscreen} />
      )}
    </>
  );
}

// Fullscreen overlay component
function FullscreenOverlay({
  vis,
  onClose,
}: {
  vis: Visualization;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="h-full max-h-[90vh] overflow-hidden border-border/50 bg-card shadow-2xl">
          {/* Fullscreen header with close button */}
          <div className="absolute top-3 right-3 z-20 flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full border border-border/30 bg-background/80 shadow-md backdrop-blur-sm transition-all duration-200 hover:border-destructive/50 hover:bg-destructive hover:text-destructive-foreground"
              onClick={onClose}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Fullscreen content */}
          <div className="h-full max-h-[90vh] overflow-auto">
            <VisualizationContent vis={vis} isFullscreen />
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function VisualizationCard({
  vis,
  onDismiss,
  onRemove,
  onFullscreen,
}: {
  vis: Visualization;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
  onFullscreen: (vis: Visualization) => void;
}) {
  const slideDirection = vis.side === 'left' ? -100 : 100;

  return (
    <motion.div
      key={vis.id}
      layout
      initial={{ opacity: 0, x: slideDirection, scale: 0.95 }}
      animate={
        vis.dismissed
          ? { opacity: 0, x: slideDirection, scale: 0.95 }
          : { opacity: 1, x: 0, scale: 1 }
      }
      exit={{ opacity: 0, x: slideDirection, scale: 0.95 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 35,
        mass: 0.8,
      }}
      onAnimationComplete={() => {
        if (vis.dismissed) {
          onRemove(vis.id);
        }
      }}
      className="group relative"
    >
      {/* Action Buttons */}
      <div className="absolute top-2 right-2 z-20 flex gap-1.5 opacity-0 transition-all duration-200 group-hover:opacity-100">
        {/* Fullscreen Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full border border-border/30 bg-background/80 shadow-md backdrop-blur-sm transition-all duration-200 hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
          onClick={() => onFullscreen(vis)}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full border border-border/30 bg-background/80 shadow-md backdrop-blur-sm transition-all duration-200 hover:border-destructive/50 hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => onDismiss(vis.id)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Visualization Content */}
      <div className="transition-transform duration-200 group-hover:scale-[1.005]">
        <VisualizationContent vis={vis} />
      </div>
    </motion.div>
  );
}

export function VisualizationContainer() {
  const {
    visualizations,
    centerVisualization,
    dismissVisualization,
    dismissCenterVisualization,
    removeVisualization,
    removeCenterVisualization,
  } = useVisualizationStore();

  // Fullscreen state
  const [fullscreenVis, setFullscreenVis] = useState<Visualization | null>(
    null
  );

  const hasVisualizations =
    visualizations.length > 0 || centerVisualization !== null;
  if (!hasVisualizations && !fullscreenVis) return null;

  // Split visualizations based on their assigned side (permanent, no flickering)
  const leftVisualizations = visualizations.filter((v) => v.side === 'left');
  const rightVisualizations = visualizations.filter((v) => v.side === 'right');

  const handleFullscreen = (vis: Visualization) => {
    setFullscreenVis(vis);
  };

  const handleCloseFullscreen = () => {
    setFullscreenVis(null);
  };

  return (
    <>
      {/* Left side */}
      {leftVisualizations.length > 0 && (
        <div className="pointer-events-none absolute top-20 left-4 z-30 flex max-h-[calc(100vh-10rem)] w-96 flex-col gap-4 overflow-y-auto overflow-x-visible pb-4 *:pointer-events-auto">
          <AnimatePresence mode="popLayout">
            {leftVisualizations.map((vis) => (
              <VisualizationCard
                key={vis.id}
                vis={vis}
                onDismiss={dismissVisualization}
                onRemove={removeVisualization}
                onFullscreen={handleFullscreen}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Right side */}
      {rightVisualizations.length > 0 && (
        <div className="pointer-events-none fixed top-20 right-4 z-30 flex max-h-[calc(100vh-10rem)] w-96 flex-col gap-4 overflow-y-auto overflow-x-visible pb-4 *:pointer-events-auto">
          <AnimatePresence mode="popLayout">
            {rightVisualizations.map((vis) => (
              <VisualizationCard
                key={vis.id}
                vis={vis}
                onDismiss={dismissVisualization}
                onRemove={removeVisualization}
                onFullscreen={handleFullscreen}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Center: Core Mention Visualization */}
      <AnimatePresence
        onExitComplete={() => {
          if (centerVisualization?.dismissed) {
            removeCenterVisualization();
          }
        }}
      >
        {centerVisualization && !centerVisualization.dismissed && (
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="pointer-events-auto">
              {centerVisualization.type === 'core_mention' && (
                <CoreMentionCard
                  data={centerVisualization.data}
                  onDismiss={dismissCenterVisualization}
                />
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Fullscreen Overlay */}
      <AnimatePresence>
        {fullscreenVis && (
          <FullscreenOverlay
            vis={fullscreenVis}
            onClose={handleCloseFullscreen}
          />
        )}
      </AnimatePresence>
    </>
  );
}
