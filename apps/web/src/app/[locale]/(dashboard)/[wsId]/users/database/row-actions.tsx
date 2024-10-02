'use client';

import { DatePicker } from '../../../../../../components/row-actions/users/date-picker';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { getInitials } from '@/utils/name-helper';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import { SelectField } from '@repo/ui/components/ui/custom/select-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { Separator } from '@repo/ui/components/ui/separator';
import { toast } from '@repo/ui/hooks/use-toast';
import { Row } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { Ellipsis, Eye, UserIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface UserRowActionsProps {
  row: Row<WorkspaceUser>;
  href?: string;
  extraData?: any;
}

const FormSchema = z.object({
  id: z.string(),
  full_name: z.string().optional(),
  display_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthday: z.date().nullable().optional(),
  ethnicity: z.string().optional(),
  guardian: z.string().optional(),
  national_id: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
});

export function UserRowActions({ row, href, extraData }: UserRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const user = row.original;

  const deleteUser = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${user.ws_id}/users/${user.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace user',
        description: data.message,
      });
    }
  };

  const removeUserFromGroup = async ({
    wsId,
    groupId,
    userId,
  }: {
    wsId: string;
    groupId: string;
    userId: string;
  }) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${userId}`,
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

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      id: user?.id,
      full_name: user?.full_name || '',
      display_name: user?.display_name || '',
      email: user?.email || undefined,
      phone: user?.phone || '',
      gender: user?.gender?.toLocaleUpperCase() as
        | 'MALE'
        | 'FEMALE'
        | 'OTHER'
        | undefined,
      birthday: user?.birthday ? new Date(user.birthday) : undefined,
      ethnicity: user?.ethnicity || '',
      guardian: user?.guardian || '',
      national_id: user?.national_id || '',
      address: user?.address || '',
      note: user?.note || '',
    },
  });

  const [open, setOpen] = useState(false);

  const removeBirthday = () => {
    form.setValue('birthday', null);
  };

  const updateMember = async (data: z.infer<typeof FormSchema>) => {
    const response = await fetch(
      `/api/v1/workspaces/${user.ws_id}/users/${user.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          birthday: data.birthday
            ? dayjs(data.birthday).format('YYYY/MM/DD')
            : null,
        }),
      }
    );

    if (response.ok) {
      toast({
        title: t('ws-members.member-updated'),
        description: `"${user?.display_name || user?.full_name || 'Unknown'}" ${t(
          'ws-members.has-been-updated'
        )}`,
        color: 'teal',
      });
    } else {
      toast({
        title: t('ws-members.error'),
        description: `${t('ws-members.update-error')} "${
          user?.display_name || user?.full_name || 'Unknown'
        }"`,
      });
    }
    router.refresh();
    setOpen(false);
  };

  const name = form.watch('display_name') || form.watch('full_name');

  return (
    <div className="flex items-center justify-end gap-2">
      {href && (
        <Link href={href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common.view')}
          </Button>
        </Link>
      )}

      <Dialog
        open={open}
        onOpenChange={(open) => {
          if (open) form.reset();
          setOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[80vh] max-w-lg overflow-y-scroll"
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
                {name ? getInitials(name) : <UserIcon className="h-5 w-5" />}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-1">
              <p className="line-clamp-1 text-sm font-medium leading-none">
                {name ? name : <span className="opacity-50">Unknown</span>}{' '}
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
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User ID</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                    <FormMessage />
                    <FormDescription>
                      The identification number of this user in your workspace.
                      This is automatically managed by NCT Hub, and cannot be
                      changed.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                    <FormDescription>
                      The real name of this user.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                    <FormDescription>
                      This name will be displayed everywhere in the current
                      workspace for this user.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="example@rmit.edu.vn" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+123456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Gender</FormLabel>
                    <FormControl>
                      <SelectField
                        id="gender"
                        placeholder="Please select a gender"
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                        options={[
                          {
                            value: 'MALE',
                            label: 'Male',
                          },
                          {
                            value: 'FEMALE',
                            label: 'Female',
                          },
                          {
                            value: 'OTHER',
                            label: 'Other',
                          },
                        ]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-end justify-between gap-2">
                <FormField
                  control={form.control}
                  name="birthday"
                  render={({ field }) => (
                    <FormItem className="grid w-full">
                      <FormLabel>Birthday</FormLabel>
                      <FormControl className="flex">
                        <DatePicker
                          value={
                            field.value
                              ? dayjs(field.value).toDate()
                              : undefined
                          }
                          onValueChange={field.onChange}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={removeBirthday}
                  className="aspect-square"
                  disabled={!form.watch('birthday')}
                >
                  <XIcon className="h-7 w-7"></XIcon>{' '}
                </Button>
              </div>

              <Separator />

              <FormField
                control={form.control}
                name="national_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>National ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Empty" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ethnicity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ethnicity</FormLabel>
                    <FormControl>
                      <Input placeholder="Empty" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="guardian"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Guardian</FormLabel>
                    <FormControl>
                      <Input placeholder="Empty" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Empty" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input placeholder="Empty" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-center gap-2">
                <Button type="submit" className="w-full">
                  Save changes
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
          <DropdownMenuItem onClick={() => setOpen(true)}>
            {t('common.edit')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          {pathname.includes('/users/database') && (
            <DropdownMenuItem
              onClick={deleteUser}
              disabled={!user.id || !user.ws_id}
            >
              Delete
            </DropdownMenuItem>
          )}
          {extraData?.wsId && extraData?.groupId && (
            <DropdownMenuItem
              onClick={() =>
                removeUserFromGroup({
                  wsId: extraData.wsId,
                  groupId: extraData.groupId,
                  userId: user.id,
                })
              }
              disabled={!user.id || !user.ws_id}
            >
              Remove from group
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
