'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, User as UserIcon } from '@tuturuuu/icons';
import { removeWorkspaceMember } from '@tuturuuu/internal-api/workspaces';
import type { Workspace } from '@tuturuuu/types';
import type { User } from '@tuturuuu/types/primitives/User';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { workspaceMembersKeys } from './members-queries';

interface Props {
  workspace: Workspace;
  user: User;
  currentUser?: User | null;
  canManageMembers?: boolean;
}

export function MemberSettingsButton({
  workspace: ws,
  user,
  currentUser,
  canManageMembers,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('ws-members');

  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await removeWorkspaceMember(ws.id, {
        email: user.id ? null : user.email,
        userId: user.id ?? null,
      });
    },
    onSuccess: () => {
      const invited = user?.pending;
      toast({
        title: invited ? t('invitation_revoked') : t('member_removed'),
        description: invited
          ? `${t('invitation_to')} ${
              (user?.handle && `@${user?.handle}`) ||
              user?.display_name ||
              user?.email
            } ${t('has_been_revoked')}`
          : `"${user?.display_name || 'Unknown'}" ${t('has_been_removed')}`,
        color: 'teal',
      });

      queryClient.invalidateQueries({
        queryKey: workspaceMembersKeys.lists(),
      });
      if (currentUser?.id === user.id) router.push('/onboarding');
      setOpen(false);
    },
    onError: () => {
      const invited = user?.pending;
      toast({
        title: t('error'),
        description: invited
          ? t('revoke_error')
          : `${t('remove_error')} "${user?.display_name || 'Unknown'}"`,
      });
    },
  });

  const deleteMember = async () => {
    if (!canManageMembers && currentUser?.id !== user.id) return;
    await deleteMutation.mutateAsync();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-6 w-6 text-foreground/70" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[425px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Member Settings</DialogTitle>
          <DialogDescription>
            Manage member settings and permissions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border p-4">
          <Avatar>
            <AvatarImage src={user?.avatar_url || undefined} />
            <AvatarFallback className="font-semibold">
              {user?.display_name ? (
                getInitials(user.display_name)
              ) : (
                <UserIcon className="h-5 w-5" />
              )}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-1">
            <p className="line-clamp-1 font-medium text-sm leading-none">
              {user?.display_name ? (
                user.display_name
              ) : (
                <span className="opacity-50">Unknown</span>
              )}
            </p>

            <p className="line-clamp-1 text-foreground/60 text-sm">
              {user?.email ||
                (user?.handle
                  ? `@${user.handle}`
                  : user?.id?.replace(/-/g, ''))}
            </p>
          </div>
        </div>

        {(canManageMembers || currentUser?.id === user.id) && (
          <div className="mt-4">
            <Button
              variant="destructive"
              className="w-full"
              onClick={deleteMember}
              disabled={deleteMutation.isPending}
            >
              {currentUser?.id === user.id
                ? 'Leave Workspace'
                : user.pending
                  ? 'Revoke Invitation'
                  : 'Remove Member'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
