'use client';

import type { Row } from '@tanstack/react-table';
import type { WorkspaceCourse } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { CourseForm } from '@tuturuuu/ui/custom/education/courses/course-form';
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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface WorkspaceCourseRowActionsProps {
  row: Row<WorkspaceCourse>;
  enableCerts?: boolean;
}

export function WorkspaceCourseRowActions({
  row,
  enableCerts = false,
}: WorkspaceCourseRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteWorkspaceCourse = async () => {
    try {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/courses/${data.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: 'Failed to delete workspace course',
          description: data.message,
        });
      }
    } catch (_err) {
      toast({
        title: 'Error',
        description: 'There was an error while deleting the course.',
      });
    } finally {
      setShowDeleteDialog(false);
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !data.ws_id) return null;

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
        title={t('ws-courses.edit')}
        editDescription={t('ws-courses.edit_description')}
        setOpen={setShowEditDialog}
        form={
          <CourseForm
            wsId={data.ws_id}
            data={{ ...data, description: data.description ?? '' }}
            enableCerts={enableCerts}
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
            <Button variant="destructive" onClick={deleteWorkspaceCourse}>
              {t('common.delete')}
            </Button>
          </div>
        }
      />
    </div>
  );
}
