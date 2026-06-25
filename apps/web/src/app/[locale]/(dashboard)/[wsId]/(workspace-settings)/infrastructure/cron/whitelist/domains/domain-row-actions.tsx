'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import {
  deleteManagedCronWhitelistedDomain,
  type ManagedCronWhitelistedDomain,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface ManagedCronWhitelistDomainRowActionsProps {
  row: Row<ManagedCronWhitelistedDomain>;
}

export function ManagedCronWhitelistDomainRowActions({
  row,
}: ManagedCronWhitelistDomainRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();
  const data = row.original;

  const deleteDomain = async () => {
    await deleteManagedCronWhitelistedDomain(data.domain);
    router.refresh();
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">
              {t('managed-cron-whitelist.open_menu')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={deleteDomain}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
