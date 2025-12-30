'use client';

import { ChevronRight, Target } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useProjectOverview } from '../project-overview-context';

export function OverviewLinkedTasks() {
  const t = useTranslations('task_project_detail.overview');
  const {
    tasks,
    setActiveTab,
    setShowLinkTaskDialog,
    fadeInViewVariant,
  } = useProjectOverview();
  
  const recentTasks = tasks.slice(0, 5);

  return (
    <motion.div {...fadeInViewVariant(0.3)}>
      <Card className="border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="bg-linear-to-r from-dynamic-blue to-dynamic-cyan bg-clip-text font-bold text-lg text-transparent">
            {t('linked_tasks')}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('tasks')}
            className="gap-1 text-dynamic-blue hover:text-dynamic-blue"
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
                className="flex items-center justify-between rounded-lg border border-dynamic-blue/20 bg-background/50 p-3 transition-all hover:-translate-y-0.5 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/5"
              >
                <div className="flex-1">
                  <h4 className="font-medium text-sm">{task.name}</h4>
                  {task.priority && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'mt-1 text-xs',
                        task.priority === 'critical'
                          ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
                          : task.priority === 'high'
                            ? 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
                            : task.priority === 'normal'
                              ? 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                              : 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
                      )}
                    >
                      {task.priority}
                    </Badge>
                  )}
                </div>
                {task.closed_at && (
                  <Badge
                    variant="outline"
                    className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                  >
                    ✓ {t('done')}
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
              className="mt-2 text-dynamic-blue hover:text-dynamic-blue"
            >
              {t('link_tasks')}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
