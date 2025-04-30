'use client';

import { User } from '@tuturuuu/types/primitives/User';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Settings, User as UserIcon } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  workspace: Workspace;
  user: User;
  currentUser: User;
}

const FormSchema = z.object({
  role: z.string(),
  accessLevel: z.string(),
  // accessLevel: z.enum(['MEMBER', 'ADMIN', 'OWNER']),
});

export function MemberSettingsButton({
  workspace: ws,
  user,
  currentUser,
}: Props) {
  const router = useRouter();
  const t = useTranslations('ws-members');

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      role: user?.role_title || '',
      accessLevel: user?.role || 'MEMBER',
    },
  });

  const role = form.watch('role');

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

  const updateMember = async (data: z.infer<typeof FormSchema>) => {
    const response = await fetch(
      `/api/workspaces/${ws.id}/members${user.id ? `?id=${user.id}` : `?email=${user.email}`}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pending: user.pending,
          role_title: data.role,
          role: data.accessLevel,
        } as User),
      }
    );

    if (response.ok) {
      toast({
        title: t('member-updated'),
        description: `"${user?.display_name || 'Unknown'}" ${t(
          'has-been-updated'
        )}`,
        color: 'teal',
      });
    } else {
      toast({
        title: t('error'),
        description: `${t('update-error')} "${
          user?.display_name || 'Unknown'
        }"`,
      });
    }

    router.refresh();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (open) form.reset();
        setOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="text-foreground/70 h-6 w-6" />
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
            <p className="line-clamp-1 text-sm font-medium leading-none">
              {user?.display_name ? (
                user.display_name
              ) : (
                <span className="opacity-50">Unknown</span>
              )}{' '}
              {role ? <span className="text-orange-300">({role})</span> : null}
            </p>

            <p className="text-foreground/60 line-clamp-1 text-sm">
              {user?.email ||
                (user?.handle
                  ? `@${user.handle}`
                  : user?.id?.replace(/-/g, ''))}
            </p>
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(updateMember)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workspace Role</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Graphic Designer, Marketing Manager, etc."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    The role of the member in the workspace is only for display
                    purposes and does not affect workspace permissions.
                  </FormDescription>
                </FormItem>
              )}
              disabled={
                currentUser.role === 'MEMBER' ||
                (currentUser.role === 'ADMIN' && user.role === 'OWNER')
              }
            />
            {/* <Separator />
            <FormField
              control={form.control}
              name="accessLevel"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Access Level</FormLabel>
                  <FormControl>
                    <SelectField
                      id="access-level"
                      placeholder="Select an access level"
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      options={
                        user.role === 'OWNER' || currentUser.role === 'OWNER'
                          ? [
                              { value: 'MEMBER', label: 'Member' },
                              { value: 'ADMIN', label: 'Admin' },
                              {
                                value: 'OWNER',
                                label: 'Owner',
                              },
                            ]
                          : [
                              { value: 'MEMBER', label: 'Member' },
                              { value: 'ADMIN', label: 'Admin' },
                            ]
                      }
                      classNames={{ root: 'w-full' }}
                      disabled={
                        currentUser.role === 'MEMBER' ||
                        (currentUser.role === 'ADMIN' && user.role === 'OWNER')
                      }
                    />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    This will affect the member&apos;s permissions in the
                    workspace.
                  </FormDescription>
                </FormItem>
              )}
              disabled={currentUser.role === 'MEMBER'}
            /> */}
            {(currentUser.role === 'ADMIN' && user.role === 'OWNER') ||
              ((currentUser.role !== 'MEMBER' ||
                currentUser.id === user.id) && (
                <div className="flex justify-center gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-none"
                    onClick={deleteMember}
                  >
                    {currentUser.id === user.id
                      ? 'Leave Workspace'
                      : user.pending
                        ? 'Revoke Invitation'
                        : 'Remove Member'}
                  </Button>

                  {currentUser.role === 'MEMBER' || (
                    <Button type="submit" className="w-full">
                      Save changes
                    </Button>
                  )}
                </div>
              ))}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
