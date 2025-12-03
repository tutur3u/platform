'use client';

import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { useVisualizationStore } from '../../stores/visualization-store';
import type { Visualization } from '../../types/visualizations';
import { StatusChart } from './status-chart';
import { TaskDetailView } from './task-detail-view';
import { TaskListCard } from './task-list-card';
import { TimelineView } from './timeline-view';

function VisualizationCard({
  vis,
  onDismiss,
  onRemove,
}: {
  vis: Visualization;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
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
      className="relative group"
    >
      {/* Close Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -top-2 -right-2 z-20 h-7 w-7 rounded-full border border-border/50 bg-background/90 opacity-0 shadow-lg backdrop-blur-sm transition-all duration-200 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
        onClick={() => onDismiss(vis.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      {/* Visualization Content */}
      <div className="transition-transform duration-200 group-hover:scale-[1.01]">
        {vis.type === 'task_list' && <TaskListCard data={vis.data} />}
        {vis.type === 'gantt_timeline' && <TimelineView data={vis.data} />}
        {vis.type === 'status_distribution' && <StatusChart data={vis.data} />}
        {vis.type === 'task_detail' && <TaskDetailView data={vis.data} />}
      </div>
    </motion.div>
  );
}

export function VisualizationContainer() {
  const { visualizations, dismissVisualization, removeVisualization } =
    useVisualizationStore();

  if (visualizations.length === 0) return null;

  // Split visualizations based on their assigned side (permanent, no flickering)
  const leftVisualizations = visualizations.filter((v) => v.side === 'left');
  const rightVisualizations = visualizations.filter((v) => v.side === 'right');

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
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
