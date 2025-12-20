'use client';

import { Settings, User as UserIcon } from '@tuturuuu/icons';
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

interface Props {
  workspace: Workspace;
  user: User;
  currentUser: User;
  canManageMembers?: boolean;
}

export function MemberSettingsButton({
  workspace: ws,
  user,
  currentUser,
  canManageMembers,
}: Props) {
  const router = useRouter();
  const t = useTranslations('ws-members');

  const [open, setOpen] = useState(false);

  const deleteMember = async () => {
    const invited = user?.pending;

    const response = await fetch(
      `/api/workspaces/${ws.id}/members${user.id ? `?id=${user.id}` : `?email=${user.email}`}`,
      {
        method: 'DELETE',
      }
    );

    if (response.ok) {
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
      if (user.id === currentUser?.id) router.push('/onboarding');
    } else {
      toast({
        title: t('error'),
        description: invited
          ? t('revoke_error')
          : `${t('remove_error')} "${user?.display_name || 'Unknown'}"`,
      });
    }

    router.refresh();
    setOpen(false);
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

        {(canManageMembers || currentUser.id === user.id) && (
          <div className="mt-4">
            <Button
              variant="destructive"
              className="w-full"
              onClick={deleteMember}
            >
              {currentUser.id === user.id
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
