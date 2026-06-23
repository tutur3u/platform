'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis, Loader2 } from '@tuturuuu/icons';
import { deleteAIWhitelistEmail as deleteAIWhitelistEmailWithInternalApi } from '@tuturuuu/internal-api/infrastructure/ai';
import type { AIWhitelistEmail } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AI_WHITELIST_EMAILS_QUERY_KEY } from './query-keys';

interface AIWhitelistEmailRowActionsProps {
  row: Row<AIWhitelistEmail>;
}

export function AIWhitelistEmailRowActions({
  row,
}: AIWhitelistEmailRowActionsProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const data = row.original;

  const deleteMutation = useMutation({
    mutationFn: () => deleteAIWhitelistEmailWithInternalApi(data.email),
    onError: (error) => {
      toast.error(t('common.error'), {
        description: error instanceof Error ? error.message : t('common.error'),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: AI_WHITELIST_EMAILS_QUERY_KEY,
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
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
