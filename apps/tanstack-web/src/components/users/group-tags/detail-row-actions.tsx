'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis, Eye } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { removeWorkspaceGroupFromTag, tagUserGroupsQueryKey } from './queries';

interface UserGroupTagGroupRowActionsProps {
  row: Row<UserGroup>;
  extraData?: {
    tagId: string;
    wsId: string;
  };
}

export function UserGroupTagGroupRowActions({
  row,
  extraData,
}: UserGroupTagGroupRowActionsProps) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const group = row.original;

  const removeMutation = useMutation({
    mutationFn: () => {
      if (!(extraData?.wsId && extraData.tagId && group.id)) {
        throw new Error('Missing group tag context');
      }

      return removeWorkspaceGroupFromTag(
        extraData.wsId,
        extraData.tagId,
        group.id
      );
    },
    onSuccess: async () => {
      if (extraData?.wsId && extraData.tagId) {
        await queryClient.invalidateQueries({
          queryKey: tagUserGroupsQueryKey(extraData.wsId, extraData.tagId),
        });
      }
    },
    onError: (error) => {
      toast({
        title: t('users.remove_from_group_failed'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  if (!group.id || !extraData?.wsId || !extraData.tagId) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {group.href && (
        <Link href={group.href}>
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
          <DropdownMenuItem
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
          >
            {t('common.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
