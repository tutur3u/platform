'use client';

import type { Row } from '@tanstack/react-table';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { SelectField } from '@tuturuuu/ui/custom/select-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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
import { Ellipsis, Eye, Loader2, UserIcon, XIcon } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import dayjs from 'dayjs';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { ImageCropper } from '@/components/image-cropper';
import { DatePicker } from '../../../../../../components/row-actions/users/date-picker';

interface UserRowActionsProps {
  row: Row<WorkspaceUser>;
  href?: string;
  // biome-ignore lint/suspicious/noExplicitAny: <extra data can be anything>
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

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const AVATAR_SIZE = 500;

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
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [, setIsConverting] = useState(false);

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

  const compressAndResizeImage = (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context is null'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        // Set canvas size to the desired avatar size
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;

        // Draw the cropped image (already square from cropper) to the canvas
        ctx.drawImage(img, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

        canvas.toBlob(
          (compressedBlob) => {
            if (compressedBlob) {
              resolve(compressedBlob);
            } else {
              reject(new Error('Blob creation failed'));
            }
          },
          'image/jpeg',
          0.8 // 80% quality for good balance of quality and file size
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(blob);
    });
  };

  const handleFileSelect = async (file: File) => {
    try {
      setIsConverting(true);

      // Create URL for the processed image to show in the cropper
      const imageUrl = URL.createObjectURL(file);
      setSelectedImageUrl(imageUrl);
      setSelectedFile(file); // Keep original file for reference
      setCropperOpen(true);
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: t('settings-account.crop_failed'),
        description:
          error instanceof Error
            ? error.message
            : t('settings-account.crop_failed_description'),
        variant: 'destructive',
      });
    } finally {
      setIsConverting(false);
    }
  };

  const handleCropComplete = async (croppedImageBlob: Blob) => {
    try {
      // Compress and resize the cropped image to the final avatar size
      const finalBlob = await compressAndResizeImage(croppedImageBlob);

      // Create preview URL
      const previewUrl = URL.createObjectURL(finalBlob);
      setPreviewSrc(previewUrl);

      // Create file for upload
      const finalFile = new File([finalBlob], 'avatar.jpg', {
        type: 'image/jpeg',
      });

      setFile(finalFile);
      setCropperOpen(false);

      // Clean up the selected image URL
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
        setSelectedImageUrl(null);
      }
      setSelectedFile(null);
    } catch (error) {
      console.error('Error processing cropped image:', error);
      toast({
        title: t('settings-account.crop_failed'),
        description: t('settings-account.crop_failed_description'),
        variant: 'destructive',
      });
    }
  };

  const handleCropCancel = () => {
    setCropperOpen(false);
    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
      setSelectedImageUrl(null);
    }
    setSelectedFile(null);
  };

  async function uploadImageToSupabase(file: File, wsId: string) {
    const supabase = createClient();

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File is too large (max 2MB)');
    }

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
          variant: 'destructive',
        });
      }
      router.refresh();
    } catch (_) {
      toast({
        title: t('ws-members.error'),
        description: 'Failed to update member',
        variant: 'destructive',
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
        variant: 'destructive',
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
        title: t('settings-account.avatar_removed'),
        description: t('settings-account.avatar_removed_description'),
      });
    } catch (_) {
      toast({
        title: t('settings-account.remove_failed'),
        description: t('settings-account.avatar_remove_error'),
        variant: 'destructive',
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
        variant: 'destructive',
      });
    }
  };
  return (
    <div className="flex items-center justify-end gap-2">
      {/* Image Cropper Dialog */}
      {selectedImageUrl && (
        <ImageCropper
          image={selectedImageUrl}
          originalFile={selectedFile || undefined}
          open={cropperOpen}
          onOpenChange={setCropperOpen}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          title={t('settings-account.crop_avatar')}
          aspectRatio={1} // Square crop for avatars
        />
      )}

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
                  {previewSrc
                    ? t('settings-account.new_avatar')
                    : t('settings-account.upload_avatar')}
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
