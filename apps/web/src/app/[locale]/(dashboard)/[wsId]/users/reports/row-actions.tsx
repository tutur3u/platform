'use client';

import { Row } from '@tanstack/react-table';
import { WorkspaceUserReport } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Ellipsis, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface UserReportRowActionsProps {
  row: Row<WorkspaceUserReport>;
}

export function UserReportRowActions({ row }: UserReportRowActionsProps) {
  // const router = useRouter();
  const t = useTranslations();

  const report = row.original;

  const deleteUserReport = async () => {
    // const res = await fetch(
    //   `/api/v1/workspaces/${report.ws_id}/reports/${report.id}`,
    //   {
    //     method: 'DELETE',
    //   }
    // );
    // if (res.ok) {
    //   router.refresh();
    // } else {
    //   const data = await res.json();
    //   toast({
    //     title: 'Failed to delete workspace user group tag',
    //     description: data.message,
    //   });
    // }
  };

  // const [showEditDialog, setShowEditDialog] = useState(false);

  // if (!report.id || !report.ws_id) return null;
  if (!report.id) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {report.href && (
        <Link href={report.href}>
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
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={deleteUserReport}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
