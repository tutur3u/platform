'use client';

import { CronJobForm } from './form';
import { Row } from '@tanstack/react-table';
import type { WorkspaceCronJob } from '@tutur3u/types/db';
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
import { Ellipsis, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface RowActionsProps {
  row: Row<WorkspaceCronJob>;
  href?: string;
  extraData?: any;
}

export function RowActions({ row, href }: RowActionsProps) {
  const t = useTranslations();
  const router = useRouter();

  const data = row.original;

  const deleteData = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${data.ws_id}/cron/jobs/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete cron job',
        description: data.message,
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
