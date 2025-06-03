import type { AIWhitelistDomain } from '@ncthub/types/db';
import { Button } from '@ncthub/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ncthub/ui/dropdown-menu';
import { Ellipsis } from '@ncthub/ui/icons';
import { Row } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface AIWhitelistDomainRowActionsProps {
  row: Row<AIWhitelistDomain>;
}

export function AIWhitelistDomainRowActions({
  row,
}: AIWhitelistDomainRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteAIWhitelistDomain = async () => {
    const res = await fetch(
      `/api/v1/infrastructure/ai/whitelist/domain/${data.domain}`,
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
          <DropdownMenuItem onClick={deleteAIWhitelistDomain}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
