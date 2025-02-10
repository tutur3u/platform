'use client';

import WorkspaceFlashcardForm from './form';
import { Row } from '@tanstack/react-table';
import { WorkspaceFlashcard } from '@tutur3u/types/db';
import { Button } from '@tutur3u/ui/components/ui/button';
import ModifiableDialogTrigger from '@tutur3u/ui/components/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tutur3u/ui/components/ui/dropdown-menu';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface WorkspaceFlashcardRowActionsProps {
  row: Row<WorkspaceFlashcard>;
}

export function WorkspaceFlashcardRowActions({
  row,
}: WorkspaceFlashcardRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteWorkspaceFlashcard = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${data.ws_id}/flashcards/${data.id}`,
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
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
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
          <DropdownMenuItem onClick={deleteWorkspaceFlashcard}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-flashcards.edit')}
        editDescription={t('ws-flashcards.edit_description')}
        setOpen={setShowEditDialog}
        form={<WorkspaceFlashcardForm wsId={data.ws_id} data={data} />}
      />
    </div>
  );
}
