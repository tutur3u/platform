'use client';

import WorkspaceQuizForm from './form';
import { Row } from '@tanstack/react-table';
import { WorkspaceQuiz } from '@tutur3u/types/db';
import { Button } from '@tutur3u/ui/button';
import ModifiableDialogTrigger from '@tutur3u/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tutur3u/ui/dropdown-menu';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface WorkspaceQuizRowActionsProps {
  row: Row<WorkspaceQuiz>;
}

export function WorkspaceQuizRowActions({ row }: WorkspaceQuizRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteWorkspaceQuiz = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${data.ws_id}/quizzes/${data.id}`,
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

  if (!data.id || !data.ws_id) return null;

  return (
    <div className="flex items-center justify-end gap-2">
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
          <DropdownMenuItem onClick={deleteWorkspaceQuiz}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-quizzes.edit')}
        editDescription={t('ws-quizzes.edit_description')}
        setOpen={setShowEditDialog}
        form={<WorkspaceQuizForm wsId={data.ws_id} data={data} />}
      />
    </div>
  );
}
