'use client';

import WorkspaceCourseModuleForm from './form';
import { Row } from '@tanstack/react-table';
import { createClient } from '@ncthub/supabase/next/client';
import { WorkspaceCourseModule } from '@ncthub/types/db';
import { Button } from '@ncthub/ui/button';
import ModifiableDialogTrigger from '@ncthub/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ncthub/ui/dropdown-menu';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { Ellipsis } from '@ncthub/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface WorkspaceCourseModuleRowActionsProps {
  wsId: string;
  courseId: string;
  setId?: string;
  row: Row<Partial<WorkspaceCourseModule>>;
}

export function WorkspaceCourseModuleRowActions({
  wsId,
  courseId,
  setId,
  row,
}: WorkspaceCourseModuleRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();
  const supabase = createClient();

  const data = row.original;

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

  const unlinkWorkspaceCourseModule = async () => {
    if (!data.id || !setId) return;

    const { error } = await supabase
      .from('course_module_quiz_sets')
      .delete()
      .eq('module_id', data.id)
      .eq('set_id', setId);

    if (error) {
      toast({
        title: 'Failed to unlink workspace course module',
        description: error.message,
      });
    } else {
      router.refresh();
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
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {setId ? (
            <>
              <DropdownMenuItem onClick={unlinkWorkspaceCourseModule}>
                {t('common.unlink')}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={deleteWorkspaceCourseModule}>
                {t('common.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-flashcards.edit')}
        editDescription={t('ws-flashcards.edit_description')}
        setOpen={setShowEditDialog}
        form={
          <WorkspaceCourseModuleForm
            wsId={wsId}
            courseId={courseId}
            data={data}
          />
        }
      />
    </div>
  );
}
