'use client';

import {
  Calendar,
  ExternalLink,
  FileText,
  Link2,
  Target,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import NextLink from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useTasksHref } from '../../tasks-route-context';
import type { TaskProject } from '../types';
import { ProjectActionsMenu } from './project-actions-menu';
import {
  HealthStatusBadge,
  PriorityBadge,
  StatusBadge,
} from './project-badges';
import { ProjectProgressMeter } from './project-progress-meter';

interface ProjectGridCardProps {
  project: TaskProject;
  wsId: string;
  onEdit: (project: TaskProject) => void;
  onDelete: (projectId: string) => void;
  onManageTasks: (project: TaskProject) => void;
  onNavigate: (projectId: string) => void;
  navigationMode?: 'dialog' | 'route';
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
  navigationMode = 'route',
  isUpdating,
  isDeleting,
  isLinking,
  isUnlinking,
}: ProjectGridCardProps) {
  const t = useTranslations('task-projects.project_card');
  const tasksHref = useTasksHref();
  const { dateTime } = useFormatter();
  const timeline = formatTimeline(project, dateTime);

  return (
    <Card
      className="group flex min-h-[360px] cursor-pointer flex-col rounded-lg border-dynamic-surface/70 bg-background p-4 shadow-none transition-colors hover:border-dynamic-blue/40 hover:bg-dynamic-blue/5"
      onClick={() => onNavigate(project.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            <HealthStatusBadge health={project.health_status} />
          </div>
          <h3 className="line-clamp-2 font-semibold text-lg leading-tight">
            {project.name}
          </h3>
        </div>
        <ProjectActionsMenu
          project={project}
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={isUpdating || isDeleting}
        />
      </div>

      <p className="mt-3 line-clamp-3 min-h-[60px] text-muted-foreground text-sm">
        {project.description || t('no_description')}
      </p>

      <div className="mt-4 space-y-4">
        <ProjectProgressMeter
          completed={project.completedTasksCount}
          total={project.tasksCount}
        />
        <div className="grid grid-cols-2 gap-2">
          <Signal icon={Target} label={t('tasks')} value={project.tasksCount} />
          <Signal
            icon={FileText}
            label={t('documents')}
            value={project.linkedDocuments.length}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t pt-4">
        {project.lead ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7 rounded-md">
              <AvatarImage src={project.lead.avatar_url || undefined} />
              <AvatarFallback className="rounded-md text-xs">
                {project.lead.display_name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm">
              {project.lead.display_name || t('unknown')}
            </span>
          </div>
        ) : null}
        {timeline ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="h-4 w-4" />
            <span className="truncate">{timeline}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            onManageTasks(project);
          }}
          disabled={isLinking || isUnlinking}
          className="gap-2"
        >
          <Link2 className="h-4 w-4" />
          {t('manage')}
        </Button>
        {navigationMode === 'route' ? (
          <NextLink
            href={`/${wsId}${tasksHref(`/projects/${project.id}`)}`}
            onClick={(event) => event.stopPropagation()}
          >
            <Button size="sm" className="w-full gap-2">
              <ExternalLink className="h-4 w-4" />
              {t('open')}
            </Button>
          </NextLink>
        ) : (
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(project.id);
            }}
          >
            <ExternalLink className="h-4 w-4" />
            {t('open')}
          </Button>
        )}
      </div>
    </Card>
  );
}

function Signal({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border bg-dynamic-surface/20 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 font-semibold text-lg tabular-nums">{value}</p>
    </div>
  );
}

function formatTimeline(
  project: TaskProject,
  dateTime: ReturnType<typeof useFormatter>['dateTime']
) {
  if (!project.start_date && !project.end_date) return null;
  const options = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  const start = project.start_date
    ? dateTime(new Date(project.start_date), options)
    : null;
  const end = project.end_date
    ? dateTime(new Date(project.end_date), options)
    : null;
  return [start, end].filter(Boolean).join(' -> ');
}
