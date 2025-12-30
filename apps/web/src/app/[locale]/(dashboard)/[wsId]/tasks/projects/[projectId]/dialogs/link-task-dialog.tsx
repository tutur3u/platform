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
          <DialogTitle className="bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text text-transparent">
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_placeholder')}
              className="border-dynamic-purple/30"
            />
          </div>

          {/* Results */}
          <div className="max-h-100 space-y-2 overflow-auto">
            {searchQuery ? (
              filteredTasks.length > 0 ? (
                filteredTasks.map((task) => (
                  <Card
                    key={task.id}
                    className="group cursor-pointer border-2 border-muted/20 p-4 transition-all hover:border-dynamic-purple/30 hover:bg-dynamic-purple/5 hover:shadow-md"
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
                          {task.priority && <PriorityBadge priority={task.priority} />}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
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

          {/* Info */}
          <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-3">
            <p className="text-foreground/70 text-xs">{t('tip')}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
