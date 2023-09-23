'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { User as UserIcon, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { User } from '@/types/primitives/User';
import { getInitials } from '@/utils/name-helper';
import { SelectField } from '@/components/ui/custom/select-field';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import { UserSearchCombobox } from './user-search-combobox';
import { useRouter } from 'next/navigation';

interface Props {
  wsId: string;
  currentUser: User;
  label?: string;
  variant?: 'outline';
}

const FormSchema = z.object({
  wsId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.string(),
  accessLevel: z.enum(['MEMBER', 'ADMIN', 'OWNER']),
});

export default function InviteMemberButton({
  wsId,
  currentUser,
  label,
  variant,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      wsId,
      userId: '',
      role: '',
      accessLevel: 'MEMBER',
    },
  });

  const role = form.watch('role');

  const [user, setUser] = useState<User>();

  useEffect(() => {
    form.setValue('userId', user?.id || '');
  }, [user, form]);

  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    setQuery('');
  }, [open]);

  useEffect(() => {
    const searchUsers = async (query: string) => {
      const response = await fetch(`/api/users/search?query=${query}`);
      const data = await response.json();
      setUsers(
        data.users.map((user: User) => ({
          ...user,
          value: user.id,
          label: user.id,
        }))
      );
    };

    if (query) {
      searchUsers(query);
    } else {
      setUser(undefined);
      setUsers([]);
    }
  }, [query]);

  const inviteMember = async (values: z.infer<typeof FormSchema>) => {
    const res = await fetch(`/api/workspaces/${wsId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify(values),
    });

    if (res.ok) {
      toast({
        title: 'Invitation sent',
        description: `An invitation has been sent to ${
          user?.display_name || user?.handle
        }.`,
      });
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      toast({ title: 'Failed to invite member', description: data.message });
    }
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
        <Button variant={variant}>
          <UserPlus className="mr-2 h-5 w-5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Invite a member to your workspace.
          </DialogDescription>
        </DialogHeader>

        {currentUser?.role !== 'MEMBER' ? (
          user ? (
            <>
              <div className="flex items-center justify-between gap-2 rounded-md border p-4">
                <div className="flex items-center gap-2">
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

                  <div className="flex-shrink space-y-1">
                    <p className="line-clamp-1 text-sm font-medium leading-none">
                      {user?.display_name ? (
                        user.display_name
                      ) : (
                        <span className="opacity-50">Unknown</span>
                      )}{' '}
                      {role ? (
                        <span className="text-orange-300">({role})</span>
                      ) : null}
                    </p>

                    <p className="text-muted-foreground line-clamp-1 break-all text-sm">
                      {user?.handle
                        ? `@${user.handle}`
                        : user?.email ?? `@${user?.id?.replace(/-/g, '')}`}
                    </p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => {
                    setUser(undefined);
                  }}
                >
                  Change
                </Button>
              </div>

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(inviteMember)}
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
                          The role of the member in the workspace is only for
                          display purposes and does not affect workspace
                          permissions.
                        </FormDescription>
                      </FormItem>
                    )}
                    disabled={
                      currentUser.role === 'ADMIN' && user.role === 'OWNER'
                    }
                  />

                  <Separator />

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
                              user.role === 'OWNER' ||
                              currentUser.role === 'OWNER'
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
                              (currentUser.role === 'ADMIN' &&
                                user.role === 'OWNER')
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
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={user?.pending || !user}
                  >
                    Invite Member
                  </Button>
                </form>
              </Form>
            </>
          ) : (
            <UserSearchCombobox
              query={query}
              user={user}
              users={users}
              setUser={setUser}
              setQuery={setQuery}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8">
            <p className="text-muted-foreground text-center">
              You must be an admin or higher to invite members.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
