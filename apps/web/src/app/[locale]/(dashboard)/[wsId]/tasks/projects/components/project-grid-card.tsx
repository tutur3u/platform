'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Calendar,
  Edit3,
  ExternalLink,
  Link,
  MoreVertical,
  Target,
  Trash2,
} from '@tuturuuu/icons';
import NextLink from 'next/link';
import {
  HealthStatusBadge,
  PriorityBadge,
  StatusBadge,
} from './project-badges';
import type { TaskProject } from '../types';

interface ProjectGridCardProps {
  project: TaskProject;
  wsId: string;
  onEdit: (project: TaskProject) => void;
  onDelete: (projectId: string) => void;
  onManageTasks: (project: TaskProject) => void;
  onNavigate: (projectId: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
  isLinking: boolean;
  isUnlinking: boolean;
}

export function ProjectGridCard({
  project,
  wsId,
  onEdit,
  onDelete,
  onManageTasks,
  onNavigate,
  isUpdating,
  isDeleting,
  isLinking,
  isUnlinking,
}: ProjectGridCardProps) {
  const t = useTranslations('task-projects.project_card');
  const { dateTime } = useFormatter();

  return (
    <Card
      className="group flex cursor-pointer flex-col border-dynamic-purple/20 bg-dynamic-purple/5 transition-all hover:border-dynamic-purple/30 hover:shadow-md"
      onClick={(e) => {
        e.stopPropagation();
        onNavigate(project.id);
      }}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{project.name}</CardTitle>
            {project.description && (
              <CardDescription className="mt-2 line-clamp-3 leading-relaxed">
                {project.description}
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={isUpdating || isDeleting}
                className="h-8 w-8 shrink-0 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(project);
                }}
                disabled={isUpdating}
              >
                <Edit3 className="mr-2 h-4 w-4 text-dynamic-blue" />
                {t('edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                }}
                disabled={isDeleting}
                className="text-dynamic-red focus:text-dynamic-red"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3 pt-0">
        {/* Status Badges */}
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={project.status} />
          <PriorityBadge priority={project.priority} />
          <HealthStatusBadge health={project.health_status} />
        </div>

        {/* Info Cards */}
        <div className="space-y-2">
          {/* Project Lead */}
          {project.lead && (
            <div className="flex items-center gap-2.5 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/10 p-2.5">
              <Avatar className="h-7 w-7">
                <AvatarImage src={project.lead.avatar_url || undefined} />
                <AvatarFallback className="bg-dynamic-blue/20 text-dynamic-blue text-xs">
                  {project.lead.display_name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">
                  {t('project_lead')}
                </p>
                <p className="truncate font-medium text-sm">
                  {project.lead.display_name || t('unknown')}
                </p>
              </div>
            </div>
          )}

          {/* Task Progress */}
          <div className="flex items-center gap-2.5 rounded-lg border border-dynamic-indigo/20 bg-dynamic-indigo/10 p-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-indigo/20">
              <Target className="h-3.5 w-3.5 text-dynamic-indigo" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">
                {t('task_progress')}
              </p>
              <p className="font-medium text-sm">
                {project.completedTasksCount}/{project.tasksCount}{' '}
                {t('completed')}
              </p>
            </div>
          </div>

          {/* Timeline */}
          {(project.start_date || project.end_date) && (
            <div className="flex items-center gap-2.5 rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/10 p-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-purple/20">
                <Calendar className="h-3.5 w-3.5 text-dynamic-purple" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">{t('timeline')}</p>
                <p className="truncate font-medium text-sm">
                  {project.start_date &&
                    dateTime(new Date(project.start_date), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  {project.start_date && project.end_date && ' → '}
                  {project.end_date &&
                    dateTime(new Date(project.end_date), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Linked Tasks Preview */}
        {project.linkedTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{t('linked_tasks')}</p>
              <Badge
                variant="outline"
                className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan text-xs"
              >
                {project.linkedTasks.length}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.linkedTasks.slice(0, 3).map((task) => (
                <Badge
                  key={task.id}
                  variant="outline"
                  className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan text-xs"
                >
                  {task.name}
                </Badge>
              ))}
              {project.linkedTasks.length > 3 && (
                <Badge
                  variant="outline"
                  className="border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan text-xs"
                >
                  +{project.linkedTasks.length - 3} {t('more')}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <NextLink
            href={`/${wsId}/tasks/projects/${project.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" variant="default" className="w-full">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('view_details')}
            </Button>
          </NextLink>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onManageTasks(project);
            }}
            disabled={isLinking || isUnlinking}
            className="w-full"
          >
            <Link className="mr-2 h-4 w-4" />
            {t('manage_tasks')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
