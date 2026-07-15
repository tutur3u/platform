'use client';

import { Edit3, MoreVertical, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { TaskProject } from '../types';

interface ProjectActionsMenuProps {
  project: TaskProject;
  onEdit: (project: TaskProject) => void;
  onDelete: (projectId: string) => void;
  disabled: boolean;
}

export function ProjectActionsMenu({
  project,
  onEdit,
  onDelete,
  disabled,
}: ProjectActionsMenuProps) {
  const t = useTranslations('task-projects.project_card');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled}
          className="h-8 w-8 shrink-0"
          onClick={(event) => event.stopPropagation()}
          aria-label={t('actions')}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onEdit(project);
          }}
        >
          <Edit3 className="mr-2 h-4 w-4" />
          {t('edit')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onDelete(project.id);
          }}
          className="text-dynamic-red focus:text-dynamic-red"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
