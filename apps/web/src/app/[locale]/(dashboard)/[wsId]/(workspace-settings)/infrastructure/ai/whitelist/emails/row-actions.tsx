'use client';

import { Row } from '@tanstack/react-table';
import { AIWhitelistEmail } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Ellipsis } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface AIWhitelistEmailRowActionsProps {
  row: Row<AIWhitelistEmail>;
}

export function AIWhitelistEmailRowActions({
  row,
}: AIWhitelistEmailRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteAIWhitelistEmail = async () => {
    const res = await fetch(
      `/api/v1/infrastructure/ai/whitelist/${data.email}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    }
  };

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
          <DropdownMenuItem onClick={deleteAIWhitelistEmail}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
