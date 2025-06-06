'use client';

import { DatePicker } from '../../../../../../components/row-actions/users/date-picker';
import { createClient } from '@ncthub/supabase/next/client';
import { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@ncthub/ui/avatar';
import { Button } from '@ncthub/ui/button';
import { SelectField } from '@ncthub/ui/custom/select-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ncthub/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ncthub/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@ncthub/ui/form';
import { useForm } from '@ncthub/ui/hooks/use-form';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { Ellipsis, Eye, Loader2, UserIcon, XIcon } from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import { zodResolver } from '@ncthub/ui/resolvers';
import { Separator } from '@ncthub/ui/separator';
import { getInitials } from '@ncthub/utils/name-helper';
import { generateRandomUUID } from '@ncthub/utils/uuid-helper';
import { Row } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
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
  gender: z.string().optional(),
  // gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthday: z.date().nullable().optional(),
  ethnicity: z.string().optional(),
  guardian: z.string().optional(),
  national_id: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
  avatar_url: z.string().nullable().optional(),
});

export function UserRowActions({ row, href, extraData }: UserRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const user = row.original;

  const [file, setFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    user?.avatar_url || null
  );
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm({
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
      avatar_url: user?.avatar_url || '',
    },
  });

  const handleFileSelect = (file: File) => {
    const fileURL = URL.createObjectURL(file);
    setPreviewSrc(fileURL);
    setFile(file);
  };

  async function uploadImageToSupabase(file: File, wsId: string) {
    const supabase = createClient();

    const fileExtension = file.name.split('.').pop();
    const filePath = `${wsId}/users/${generateRandomUUID()}.${fileExtension}`;
    const { error } = await supabase.storage
      .from('workspaces')
      .upload(filePath, file);

    if (error) {
      console.error('Error uploading file:', error.message);
      throw new Error('Failed to upload image');
    }

    const { data, error: signedURLError } = await supabase.storage
      .from('workspaces')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (signedURLError) {
      console.error('Error generating signed URL:', signedURLError.message);
      throw new Error('Failed to generate signed URL');
    }

    return data.signedUrl;
  }

  const updateMember = async (data: z.infer<typeof FormSchema>) => {
    setSaving(true);

    try {
      if (file) {
        const signedUrl = await uploadImageToSupabase(file, extraData.wsId);
        data.avatar_url = signedUrl;
      }

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
      // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast({
        title: t('ws-members.error'),
        description: 'Failed to update member',
      });
    } finally {
      setSaving(false);
    }
  };

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
  const removeAvatar = async () => {
    setSaving(true);

    try {
      const supabase = createClient();
      console.log('removed called');
      console.log(user.id, 'user id');

      // Update the database
      const { data, error: updateError } = await supabase
        .from('workspace_users')
        .update({ avatar_url: null })
        .eq('id', user.id);

      console.log('Update result:', data);
      if (updateError) {
        throw new Error('Error updating avatar_url in the database');
      }

      // Update form state
      setPreviewSrc(null);
      form.setValue('avatar_url', null); // Clear avatar_url in the form state

      toast({
        title: 'Avatar removed successfully',
        description: 'The user avatar has been removed.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to remove avatar',
      });
    } finally {
      setSaving(false);
    }
  };

  const name = form.watch('display_name') || form.watch('full_name');
  const removeUserFromGroup = async ({
    wsId,
    groupId,
    userId,
  }: {
    wsId: string;
    groupId: string;
    userId: string;
  }) => {
    console.log(wsId, 'wisalsdkac');
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
              <AvatarImage src={previewSrc || undefined} />
              <AvatarFallback className="font-semibold">
                {name ? getInitials(name) : <UserIcon className="h-5 w-5" />}
              </AvatarFallback>
            </Avatar>

            <div>
              <Button variant="ghost" className="mt-2">
                <label htmlFor="file-upload" className="cursor-pointer">
                  Upload Avatar
                </label>
              </Button>
              <input
                id="file-upload"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              {previewSrc && (
                <Button variant="destructive" onClick={removeAvatar}>
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    t('settings-account.remove_avatar')
                  )}
                </Button>
              )}
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
                  onClick={() => form.setValue('birthday', null)}
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
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'Save changes'
                  )}
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
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
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
              {t('common.delete')}
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
              {t('user-data-table.remove-from-group')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
