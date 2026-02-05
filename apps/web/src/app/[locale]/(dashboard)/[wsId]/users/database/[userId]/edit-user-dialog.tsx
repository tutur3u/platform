'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Pencil } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import UserForm from '../form';

interface EditUserDialogProps {
  wsId: string;
  data: WorkspaceUser;
}

export default function EditUserDialog({ wsId, data }: EditUserDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    toast.success(t('ws-members.member-updated'), {
      description: `"${data.display_name || data.full_name || 'Unknown'}" ${t('ws-members.has-been-updated')}`,
    });
    setOpen(false);
    router.refresh();
    queryClient.invalidateQueries({
      queryKey: ['workspace-users', wsId],
    });
  };

  const handleError = (error: string) => {
    toast.error(t('ws-members.error'), {
      description: error,
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="mr-1 h-4 w-4" />
        {t('common.edit')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[80vh] max-w-4xl overflow-y-scroll"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('ws-members.member-settings')}</DialogTitle>
            <DialogDescription>
              {t('ws-members.edit-member-description')}
            </DialogDescription>
          </DialogHeader>

          <UserForm
            wsId={wsId}
            data={data}
            onSuccess={handleSuccess}
            onError={handleError}
            showUserID={true}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
