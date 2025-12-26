'use client';

import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
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

interface ProjectListItemProps {
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

export function ProjectListItem({
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
}: ProjectListItemProps) {
  const t = useTranslations('task-projects.project_card');

  const progressPercent =
    project.tasksCount > 0
      ? Math.round((project.completedTasksCount / project.tasksCount) * 100)
      : 0;

  return (
    <Card
      className="group cursor-pointer overflow-hidden border-dynamic-purple/20 bg-linear-to-br from-dynamic-purple/5 to-transparent transition-all hover:border-dynamic-purple/30 hover:shadow-lg"
      onClick={(e) => {
        e.stopPropagation();
        onNavigate(project.id);
      }}
    >
      <div className="flex">
        {/* Left Accent Bar with Progress */}
        <div className="relative flex w-24 flex-col items-center justify-center gap-3 border-dynamic-purple/20 border-r bg-dynamic-purple/10 p-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-purple/30 to-dynamic-indigo/30 shadow-sm">
            <Target className="h-7 w-7 text-dynamic-purple" />
          </div>
          <div className="text-center">
            <p className="font-bold text-2xl text-dynamic-purple">
              {progressPercent}%
            </p>
            <p className="text-muted-foreground text-xs">{t('complete')}</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4 p-5">
          <div className="flex items-center justify-between">
            {/* Title Row with Badges */}
            <div className="flex flex-wrap items-center gap-3">
              <NextLink
                href={`/${wsId}/tasks/projects/${project.id}`}
                className="group/link"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="inline-flex items-center gap-2 font-bold text-xl transition-colors hover:text-dynamic-purple">
                  {project.name}
                  <ExternalLink className="h-4 w-4 opacity-0 transition-opacity group-hover/link:opacity-100" />
                </h3>
              </NextLink>
              <StatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />
              <HealthStatusBadge health={project.health_status} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isUpdating || isDeleting}
                  className="h-9 w-9 p-0"
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
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              {/* Description */}
              {project.description && (
                <p className="line-clamp-3 text-muted-foreground leading-relaxed">
                  {project.description}
                </p>
              )}

              {/* Horizontal Info Bar */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                {/* Project Lead */}
                {project.lead && (
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-9 w-9 ring-2 ring-dynamic-blue/30 ring-offset-2 ring-offset-background">
                      <AvatarImage src={project.lead.avatar_url || undefined} />
                      <AvatarFallback className="bg-linear-to-br from-dynamic-blue/30 to-dynamic-purple/20 font-semibold text-dynamic-blue">
                        {project.lead.display_name?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t('project_lead')}
                      </p>
                      <p className="font-semibold">
                        {project.lead.display_name || t('unknown')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Task Stats */}
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-indigo/20 to-dynamic-cyan/10">
                    <Target className="h-4 w-4 text-dynamic-indigo" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">
                      {t('tasks')}
                    </p>
                    <p className="font-semibold">
                      {project.completedTasksCount} of {project.tasksCount}
                    </p>
                  </div>
                </div>

                {/* Timeline */}
                {(project.start_date || project.end_date) && (
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-purple/20 to-dynamic-pink/10">
                      <Calendar className="h-4 w-4 text-dynamic-purple" />
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t('timeline')}
                      </p>
                      <p className="font-semibold">
                        {project.start_date &&
                          new Date(project.start_date).toLocaleDateString(
                            'en-GB',
                            {
                              day: 'numeric',
                              month: 'numeric',
                              year: 'numeric',
                            }
                          )}
                        {project.start_date && project.end_date && ' → '}
                        {project.end_date &&
                          new Date(project.end_date).toLocaleDateString(
                            'en-GB',
                            {
                              day: 'numeric',
                              month: 'numeric',
                              year: 'numeric',
                            }
                          )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Linked Tasks Count */}
                {project.linkedTasks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-cyan/20 to-dynamic-teal/10">
                      <Link className="h-4 w-4 text-dynamic-cyan" />
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {t('linked')}
                      </p>
                      <p className="font-semibold">
                        {project.linkedTasks.length}{' '}
                        {project.linkedTasks.length !== 1
                          ? t('tasks_plural')
                          : t('task')}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Linked Tasks Pills */}
              {project.linkedTasks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
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
              )}
            </div>

            {/* Right Actions Column */}
            <div className="flex shrink-0 flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onManageTasks(project);
                }}
                disabled={isLinking || isUnlinking}
                className="whitespace-nowrap"
              >
                <Link className="mr-2 h-3.5 w-3.5" />
                {t('manage')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
