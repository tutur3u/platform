'use client';

import {
  Calendar,
  ExternalLink,
  FileText,
  Link2,
  Target,
  User,
} from '@tuturuuu/icons';
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

interface ProjectListItemProps {
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

export function ProjectListItem({
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
}: ProjectListItemProps) {
  const t = useTranslations('task-projects.project_card');
  const tasksHref = useTasksHref();
  const { dateTime } = useFormatter();

  return (
    <Card
      className="group cursor-pointer rounded-lg border-dynamic-surface/70 bg-background p-4 shadow-none transition-colors hover:border-dynamic-blue/40 hover:bg-dynamic-blue/5"
      onClick={() => onNavigate(project.id)}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px_132px] xl:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {navigationMode === 'route' ? (
                <NextLink
                  href={`/${wsId}${tasksHref(`/projects/${project.id}`)}`}
                  className="inline-flex max-w-full items-center gap-2 font-semibold text-lg hover:text-dynamic-blue"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="truncate">{project.name}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </NextLink>
              ) : (
                <button
                  type="button"
                  className="inline-flex max-w-full items-center gap-2 text-left font-semibold text-lg hover:text-dynamic-blue"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNavigate(project.id);
                  }}
                >
                  <span className="truncate">{project.name}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
              <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                {project.description || t('no_description')}
              </p>
            </div>
            <ProjectActionsMenu
              project={project}
              onEdit={onEdit}
              onDelete={onDelete}
              disabled={isUpdating || isDeleting}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            <HealthStatusBadge health={project.health_status} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <ProjectProgressMeter
            completed={project.completedTasksCount}
            total={project.tasksCount}
            compact
          />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat icon={Target} label={t('tasks')} value={project.tasksCount} />
            <Stat
              icon={FileText}
              label={t('documents')}
              value={project.linkedDocuments.length}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <MetaRow
            icon={User}
            value={project.lead?.display_name || t('unknown')}
          />
          <MetaRow
            icon={Calendar}
            value={formatDate(project.end_date, dateTime) ?? t('no_due_date')}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              onManageTasks(project);
            }}
            disabled={isLinking || isUnlinking}
            className="mt-1 gap-2"
          >
            <Link2 className="h-4 w-4" />
            {t('manage')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border bg-dynamic-surface/20 p-2">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-sm">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{value}</span>
    </div>
  );
}

function formatDate(
  value: string | null,
  dateTime: ReturnType<typeof useFormatter>['dateTime']
) {
  if (!value) return null;
  return dateTime(new Date(value), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
