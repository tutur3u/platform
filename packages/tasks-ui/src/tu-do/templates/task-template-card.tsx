'use client';

import { Archive, CopyPlus, FileText, Lock, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { WorkspaceTaskTemplate } from './task-template-api';

interface TaskTemplateCardProps {
  onArchive: (template: WorkspaceTaskTemplate) => void;
  onUse: (template: WorkspaceTaskTemplate) => void;
  template: WorkspaceTaskTemplate;
}

export function TaskTemplateCard({
  onArchive,
  onUse,
  template,
}: TaskTemplateCardProps) {
  const t = useTranslations('ws-task-templates');
  const visibilityIcon =
    template.visibility === 'private' ? (
      <Lock className="h-3.5 w-3.5" />
    ) : (
      <Users className="h-3.5 w-3.5" />
    );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate text-base">
              {template.name}
            </CardTitle>
            <CardDescription className="truncate">
              {template.slug}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 gap-1 text-xs',
              template.visibility === 'private' &&
                'border-dynamic-orange/30 text-dynamic-orange',
              template.visibility === 'workspace' &&
                'border-dynamic-blue/30 text-dynamic-blue'
            )}
          >
            {visibilityIcon}
            <span>{t(`visibility.${template.visibility}`)}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{template.task_name}</span>
          </div>
          {template.description && (
            <p className="line-clamp-3 text-muted-foreground text-sm">
              {template.description}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 text-muted-foreground text-xs">
          {template.priority && (
            <Badge variant="secondary">
              {t(`priority.${template.priority}`)}
            </Badge>
          )}
          {template.label_ids.length > 0 && (
            <Badge variant="secondary">
              {t('card.labels', { count: template.label_ids.length })}
            </Badge>
          )}
          {template.assignee_ids.length > 0 && (
            <Badge variant="secondary">
              {t('card.assignees', { count: template.assignee_ids.length })}
            </Badge>
          )}
          {template.project_ids.length > 0 && (
            <Badge variant="secondary">
              {t('card.projects', { count: template.project_ids.length })}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={() => onUse(template)}>
            <CopyPlus className="h-4 w-4" />
            {t('actions.use')}
          </Button>
          {template.isOwner && (
            <Button
              aria-label={t('actions.archive')}
              onClick={() => onArchive(template)}
              size="icon"
              variant="outline"
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
