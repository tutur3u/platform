'use client';

import { Link2, Target } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { useTranslations } from 'next-intl';
import { PriorityBadge } from '../../components/project-badges';

interface LinkTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredTasks: Task[];
  isLinking: boolean;
  onLinkTask: (taskId: string) => void;
}

export function LinkTaskDialog({
  open,
  onOpenChange,
  searchQuery,
  setSearchQuery,
  filteredTasks,
  isLinking,
  onLinkTask,
}: LinkTaskDialogProps) {
  const t = useTranslations('task_project_detail.link_dialog');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_placeholder')}
            />
          </div>

          <div className="max-h-100 space-y-2 overflow-auto">
            {searchQuery ? (
              filteredTasks.length > 0 ? (
                filteredTasks.map((task) => (
                  <Card
                    key={task.id}
                    className="group cursor-pointer rounded-lg p-4 shadow-none transition-colors hover:bg-muted/30"
                    onClick={() => onLinkTask(task.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="mb-1 font-medium">{task.name}</h4>
                        {task.description && (
                          <p className="line-clamp-2 text-muted-foreground text-sm">
                            {getDescriptionText(task.description)}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {task.priority && (
                            <PriorityBadge priority={task.priority} />
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        disabled={isLinking}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground text-sm">
                    {t('no_tasks_found', { query: searchQuery })}
                  </p>
                </div>
              )
            ) : (
              <div className="py-12 text-center">
                <Target className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">
                  {t('start_typing')}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-foreground/70 text-xs">{t('tip')}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
