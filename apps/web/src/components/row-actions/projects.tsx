'use client';

import ProjectEditDialog from '@/app/[lang]/(dashboard)/[wsId]/projects/_components/project-edit-dialog';
import { TaskBoard } from '@/types/primitives/TaskBoard';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { Button } from '@repo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import { toast } from '@repo/ui/hooks/use-toast';
import { Row } from '@tanstack/react-table';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ProjectRowActionsProps {
  row: Row<TaskBoard>;
}

export function ProjectRowActions({ row }: ProjectRowActionsProps) {
  const router = useRouter();
  const { t } = useTranslation('ws-projects');

  const project = row.original;

  const deleteProject = async () => {
    const res = await fetch(
      `/api/workspaces/${project.ws_id}/projects/${project.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace project',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!project.id || !project.ws_id) return null;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteProject}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectEditDialog
        data={project}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={t('edit_project')}
      />
    </>
  );
}
