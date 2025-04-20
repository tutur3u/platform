'use client';

import { Row } from '@tanstack/react-table';
import { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Ellipsis, Eye } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface UserGroupRowActionsProps {
  row: Row<UserGroup>;
  extraData?: any;
}

export function UserGroupRowActions({
  row,
  extraData,
}: UserGroupRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const group = row.original;

  const removeUserFromGroup = async ({
    wsId,
    tagId,
    groupId,
  }: {
    wsId: string;
    tagId: string;
    groupId: string;
  }) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/group-tags/${tagId}/user-groups/${groupId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to remove user from group',
        description: data.message,
      });
    }
  };

  if (!group.id || !group.ws_id || !(extraData?.wsId && extraData?.tagId))
    return null;

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
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem
            onClick={() =>
              removeUserFromGroup({
                wsId: extraData.wsId,
                tagId: extraData.tagId,
                groupId: group.id,
              })
            }
            disabled={!group.id || !group.ws_id}
          >
            Remove from tag
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
