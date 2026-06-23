'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import { deleteAIWhitelistDomain } from '@tuturuuu/internal-api/infrastructure/ai';
import type { AIWhitelistDomain } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AI_WHITELIST_DOMAINS_QUERY_KEY } from './query-keys';

interface AIWhitelistDomainRowActionsProps {
  row: Row<AIWhitelistDomain>;
}

export function AIWhitelistDomainRowActions({
  row,
}: AIWhitelistDomainRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();
  const queryClient = useQueryClient();

  const data = row.original;

  const deleteMutation = useMutation({
    mutationFn: async (domain: string) => deleteAIWhitelistDomain(domain),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: AI_WHITELIST_DOMAINS_QUERY_KEY,
      });
      router.refresh();
    },
  });

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
          <DropdownMenuItem
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(data.domain)}
          >
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
