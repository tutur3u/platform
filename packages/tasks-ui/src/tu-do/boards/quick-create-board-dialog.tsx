'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { TaskBoardForm } from './form';

export interface QuickCreateBoardDialogProps {
  wsId: string;
  openWhenEmpty: boolean;
}

export function QuickCreateBoardDialog({
  wsId,
  openWhenEmpty,
}: QuickCreateBoardDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (openWhenEmpty) setOpen(true);
  }, [openWhenEmpty]);

  const defaultName = useMemo(
    () => t('ws-task-boards.quick_create.default_name'),
    [t]
  );

  const handleFinish = (data: {
    id?: string;
    name?: string;
    icon?: string | null;
  }) => {
    setOpen(false);

    const boardId = data.id;
    if (!boardId) return;

    // Best-effort: navigate to the new board from the current boards page.
    const base = pathname.replace(/\/$/, '');
    router.push(`${base}/${boardId}`);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>{t('ws-task-boards.create')}</DialogTitle>
          <DialogDescription>
            {t('ws-task-boards.description')}
          </DialogDescription>
        </DialogHeader>
        <TaskBoardForm
          wsId={wsId}
          data={{ name: defaultName }}
          showCancel
          onCancel={() => setOpen(false)}
          onFinish={handleFinish}
        />
      </DialogContent>
    </Dialog>
  );
}
