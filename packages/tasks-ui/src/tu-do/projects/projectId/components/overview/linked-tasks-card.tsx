'use client';

import { CheckCircle2, ChevronRight, Target } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { PriorityBadge } from '../../../components/project-badges';
import { useProjectOverview } from '../project-overview-context';

export function OverviewLinkedTasks() {
  const t = useTranslations('task_project_detail.overview');
  const { tasks, setActiveTab, setShowLinkTaskDialog, fadeInViewVariant } =
    useProjectOverview();

  const recentTasks = tasks.slice(0, 5);

  return (
    <motion.div {...fadeInViewVariant(0.3)}>
      <Card className="rounded-lg bg-background p-5 shadow-none">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="font-semibold text-base">{t('linked_tasks')}</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('tasks')}
            className="gap-1"
          >
            {t('view_all')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {recentTasks.length > 0 ? (
          <div className="space-y-2">
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm">{task.name}</h4>
                  {task.priority && <PriorityBadge priority={task.priority} />}
                </div>
                {task.closed_at && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {t('done')}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {t('no_tasks_linked')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveTab('tasks');
                setShowLinkTaskDialog(true);
              }}
              className="mt-2"
            >
              {t('link_tasks')}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
