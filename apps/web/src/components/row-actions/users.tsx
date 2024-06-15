'use client';

import { DatePicker } from './users/date-picker';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { getInitials } from '@/utils/name-helper';
import { EllipsisHorizontalIcon } from '@heroicons/react/20/solid';
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
import { User as UserIcon } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface UserRowActionsProps {
  row: Row<WorkspaceUser>;
  href?: string;
}

const FormSchema = z.object({
  id: z.string(),
  fullName: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthday: z.date().optional(),
  ethnicity: z.string().optional(),
  guardianName: z.string().optional(),
  nationalId: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
});

export function UserRowActions({ row, href }: UserRowActionsProps) {
  const { t } = useTranslation('ws-members');
  const router = useRouter();

  const user = row.original;
  const ws = { id: user.ws_id || '' };

  const deleteUser = async () => {
    const res = await fetch(`/api/workspaces/${user.ws_id}/users/${user.id}`, {
      method: 'DELETE',
    });

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

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      id: user?.id || '',
      fullName: user?.full_name || '',
      displayName: user?.display_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      gender: user?.gender?.toLocaleUpperCase() as
        | 'MALE'
        | 'FEMALE'
        | 'OTHER'
        | undefined,
      birthday: user?.birthday ? new Date(user.birthday) : undefined,
      ethnicity: user?.ethnicity || '',
      guardianName: user?.guardian || '',
      nationalId: user?.national_id || '',
      address: user?.address || '',
      note: user?.note || '',
    },
  });

  const [open, setOpen] = useState(false);

  const deleteMember = async () => {
    const response = await fetch(
      `/api/workspaces/${ws.id}/members/${user.id}`,
      {
        method: 'DELETE',
      }
    );

    if (response.ok) {
      toast({
        title: t('member_removed'),
        description: `"${user?.display_name || 'Unknown'}" ${t(
          'has_been_removed'
        )}`,
        color: 'teal',
      });
    } else {
      toast({
        title: t('error'),
        description: `${t('remove_error')} "${
          user?.display_name || 'Unknown'
        }"`,
      });
    }

    router.refresh();
    setOpen(false);
  };

  const updateMember = async (data: z.infer<typeof FormSchema>) => {
    const response = await fetch(
      `/api/workspaces/${ws.id}/members/${user.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: user.id,
          full_name: data.fullName,
          display_name: data.displayName,
        } as WorkspaceUser),
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

  const name = form.watch('displayName') || form.watch('fullName');

  return (
    <>
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
                      This is automatically managed by Tuturuuu, and cannot be
                      changed.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="fullName"
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
                name="displayName"
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
                      <Input placeholder="example@tuturuuu.com" {...field} />
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

              <FormField
                control={form.control}
                name="birthday"
                render={({ field }) => (
                  <FormItem className="grid w-full">
                    <FormLabel>Birthday</FormLabel>
                    <FormControl>
                      <DatePicker
                        defaultValue={
                          field.value ? dayjs(field.value).toDate() : undefined
                        }
                        onValueChange={field.onChange}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="nationalId"
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
                name="guardianName"
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
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-none"
                  onClick={deleteMember}
                >
                  Remove Member
                </Button>

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
            <EllipsisHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {href && (
            <Link href={href}>
              <DropdownMenuItem>View</DropdownMenuItem>
            </Link>
          )}

          <DropdownMenuItem onClick={() => setOpen(true)}>
            Edit
          </DropdownMenuItem>
          {/* <DropdownMenuItem>Make a copy</DropdownMenuItem> */}
          {/* <DropdownMenuItem>Favorite</DropdownMenuItem> */}
          {/* <DropdownMenuSeparator /> */}
          {/* <DropdownMenuSub>
          <DropdownMenuSubTrigger>Labels</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={task.label}>
              {labels.map((label) => (
                <DropdownMenuRadioItem key={label.value} value={label.value}>
                  {label.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub> */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={deleteUser}
            disabled={!user.id || !user.ws_id}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
