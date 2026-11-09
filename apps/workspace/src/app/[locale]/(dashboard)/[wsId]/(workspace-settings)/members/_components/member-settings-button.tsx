'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Settings, User as UserIcon } from '@tuturuuu/icons';
import {
  removeWorkspaceMember,
  updateWorkspaceMemberProfile,
} from '@tuturuuu/internal-api/workspaces';
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
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
  const [displayName, setDisplayName] = useState(user.display_name ?? '');

  const canEditDisplayName = !!canManageMembers && (!!user.id || !!user.email);

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
      if (currentUser?.id === user.id) router.push('/');
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

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      await updateWorkspaceMemberProfile(ws.id, {
        displayName,
        email: user.id ? null : user.email,
        userId: user.id ?? null,
      });
    },
    onSuccess: () => {
      toast({
        title: t('member-updated'),
        description: t('profile_display_name_updated'),
        color: 'teal',
      });

      queryClient.invalidateQueries({
        queryKey: workspaceMembersKeys.lists(),
      });
      setOpen(false);
    },
    onError: (error) => {
      toast({
        title: t('error'),
        description:
          error instanceof Error
            ? error.message
            : t('profile_display_name_update_error'),
      });
    },
  });

  const deleteMember = async () => {
    if (!canManageMembers && currentUser?.id !== user.id) return;
    await deleteMutation.mutateAsync();
  };

  const saveDisplayName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditDisplayName) return;

    await updateProfileMutation.mutateAsync();
  };

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDisplayName(user.display_name ?? '');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
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
          <DialogTitle>{t('member-settings')}</DialogTitle>
          <DialogDescription>
            {t('members_workspace_settings_description')}
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
                <span className="opacity-50">{t('unknown_member')}</span>
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

        {canEditDisplayName && (
          <form className="space-y-3" onSubmit={saveDisplayName}>
            <div className="space-y-2">
              <Label htmlFor={`member-display-name-${user.id ?? user.email}`}>
                {t('profile_display_name')}
              </Label>
              <Input
                id={`member-display-name-${user.id ?? user.email}`}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t('profile_display_name_placeholder')}
                maxLength={MAX_NAME_LENGTH}
              />
              <p className="text-foreground/60 text-xs">
                {t('profile_display_name_description')}
              </p>
            </div>

            <Button
              className="w-full"
              disabled={updateProfileMutation.isPending}
              type="submit"
              variant="default"
            >
              {updateProfileMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('save_profile_display_name')
              )}
            </Button>
          </form>
        )}

        {(canManageMembers || currentUser?.id === user.id) && (
          <div className="mt-4">
            <Button
              variant="destructive"
              className="w-full"
              onClick={deleteMember}
              disabled={deleteMutation.isPending}
            >
              {currentUser?.id === user.id
                ? t('leave_workspace')
                : user.pending
                  ? t('revoke_invitation')
                  : t('remove_member')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
