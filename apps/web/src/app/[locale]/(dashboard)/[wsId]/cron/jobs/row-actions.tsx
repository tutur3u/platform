'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis, Eye } from '@tuturuuu/icons';
import { deleteWorkspaceCronJob } from '@tuturuuu/internal-api';
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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ManagedWorkspaceCronJob } from '../types';
import { CronJobForm } from './form';

interface RowActionsProps {
  row: Row<ManagedWorkspaceCronJob>;
  href?: string;
  extraData?: any;
}

export function RowActions({ row, href }: RowActionsProps) {
  const t = useTranslations();
  const router = useRouter();

  const data = row.original;

  const deleteData = async () => {
    try {
      await deleteWorkspaceCronJob(data.ws_id, data.id);
      router.refresh();
    } catch (error) {
      toast({
        title: t('cron-job-form.delete_failed'),
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      {href && (
        <Link href={href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common.view')}
          </Button>
        </Link>
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">{t('common.open_menu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            {t('common.edit')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={deleteData}
            disabled={!data.id || !data.ws_id}
          >
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-cron-jobs.edit')}
        editDescription={t('ws-cron-jobs.edit_description')}
        setOpen={setShowEditDialog}
        form={<CronJobForm wsId={data.ws_id} data={data} />}
      />
    </div>
  );
}
