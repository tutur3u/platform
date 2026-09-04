'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useLocale, useTranslations } from 'next-intl';
import type { SharedTaskViewResponse } from '@/app/api/v1/shared/tasks/[shareCode]/response';
import { getSharedTaskDescriptionText } from './content-contract';

interface SharedTaskReadOnlyContentProps {
  response: SharedTaskViewResponse;
  onClose: () => void;
}

export function SharedTaskReadOnlyContent({
  response,
  onClose,
}: SharedTaskReadOnlyContentProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const { task, workspace, board, list } = response;
  const description = getSharedTaskDescriptionText(task.description);
  const dueDate = task.end_date
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
        new Date(task.end_date)
      )
    : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="gap-3 text-left">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            <span>{workspace.name}</span>
            <span aria-hidden="true">/</span>
            <span>{board.name}</span>
            <span aria-hidden="true">/</span>
            <span>{list.name}</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <DialogTitle className="text-2xl leading-tight">
              {task.name}
            </DialogTitle>
            <Badge variant="secondary">{t('task_sharing.view_only')}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {(task.priority || dueDate) && (
            <dl className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
              {task.priority && (
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t('priority')}
                  </dt>
                  <dd className="mt-1 font-medium capitalize">
                    {task.priority}
                  </dd>
                </div>
              )}
              {dueDate && (
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t('due_date')}
                  </dt>
                  <dd className="mt-1 font-medium">{dueDate}</dd>
                </div>
              )}
            </dl>
          )}

          {description && (
            <section className="space-y-2">
              <h2 className="font-medium text-sm">{t('details')}</h2>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {description}
              </p>
            </section>
          )}

          {task.labels.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-medium text-sm">{t('labels')}</h2>
              <div className="flex flex-wrap gap-2">
                {task.labels.map((label) => (
                  <Badge key={label.id} variant="outline">
                    <span
                      aria-hidden="true"
                      className="mr-1.5 size-2 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.name}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {task.projects.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-medium text-sm">{t('projects')}</h2>
              <div className="flex flex-wrap gap-2">
                {task.projects.map((project) => (
                  <Badge key={project.id} variant="outline">
                    {project.name}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {task.assignees.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-medium text-sm">{t('assignees')}</h2>
              <div className="flex flex-wrap gap-3">
                {task.assignees.map((assignee) => (
                  <div
                    className="flex items-center gap-2 text-sm"
                    key={assignee.id}
                  >
                    <Avatar className="size-7">
                      <AvatarImage src={assignee.avatar_url} />
                      <AvatarFallback>
                        {assignee.display_name?.slice(0, 1).toUpperCase() ||
                          '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span>{assignee.display_name || assignee.handle}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
