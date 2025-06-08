'use client';


import { Row } from '@tanstack/react-table';
import { WorkspaceCourseModule } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Ellipsis } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CourseModuleForm } from '@tuturuuu/ui/custom/education/modules/course-module-form';

interface WorkspaceCourseModuleRowActionsProps {
  wsId: string;
  courseId: string;
  row: Row<WorkspaceCourseModule>;
}

export function WorkspaceCourseModuleRowActions({
  wsId,
  courseId,
  row,
}: WorkspaceCourseModuleRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteWorkspaceCourseModule = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/course-modules/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace user group tag',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !wsId) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {/* {data.href && (
        <Link href={data.href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common.view')}
          </Button>
        </Link>
      )} */}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-course-modules.edit')}
        editDescription={t('ws-course-modules.edit_description')}
        setOpen={setShowEditDialog}
        form={
          <CourseModuleForm
            wsId={wsId}
            courseId={courseId}
            data={data}
          />
        }
      />

      <ModifiableDialogTrigger
        data={data}
        open={showDeleteDialog}
        title={t('ws-courses.delete_confirm_title', { name: data.name })}
        editDescription={t('common.confirm_delete_description')}
        setOpen={setShowDeleteDialog}
        form={
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={deleteWorkspaceCourseModule}>
              {t('common.delete')}
            </Button>
          </div>
        }
      />
    </div>
  );
}
