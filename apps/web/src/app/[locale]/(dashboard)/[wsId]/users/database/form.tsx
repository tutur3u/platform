'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { SelectField } from '@tuturuuu/ui/custom/select-field';
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
import { Loader2, UserIcon } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { ImageCropper } from '@/components/image-cropper';
import { DatePicker } from '@/components/row-actions/users/date-picker';
import { convertHeicToJpeg, isHeicFile } from '@/lib/heic-converter';

interface Props {
  wsId: string;
  data?: WorkspaceUser;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  full_name: z.string().optional(),
  display_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  gender: z.string().optional(),
  // gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthday: z.date().optional(),
  ethnicity: z.string().optional(),
  guardian: z.string().optional(),
  national_id: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
});

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const AVATAR_SIZE = 500;

export default function UserForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    data?.avatar_url || null
  );
  const [file, setFile] = useState<File | null>(null); // Track the file selected
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [, setIsConverting] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      full_name: data?.full_name || '',
      display_name: data?.display_name || '',
      email: data?.email || undefined,
      phone: data?.phone || '',
      gender: data?.gender?.toLocaleUpperCase() as
        | 'MALE'
        | 'FEMALE'
        | 'OTHER'
        | undefined,
      birthday: data?.birthday ? new Date(data.birthday) : undefined,
      ethnicity: data?.ethnicity || '',
      guardian: data?.guardian || '',
      national_id: data?.national_id || '',
      address: data?.address || '',
      note: data?.note || '',
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
      let processedFile = file;

      // Convert HEIC files to JPEG first for browser compatibility
      if (isHeicFile(file)) {
        console.log('Converting HEIC file to JPEG for display...');
        processedFile = await convertHeicToJpeg(file);
      }

      // Create URL for the processed image to show in the cropper
      const imageUrl = URL.createObjectURL(processedFile);
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

  const removeAvatar = async () => {
    setSaving(true);
    setPreviewSrc(null);
    setFile(null);

    if (!data?.avatar_url) {
      setSaving(false);
      return;
    }

    router.refresh();
    setSaving(false);
  };

  async function uploadImageToSupabase(file: File, wsId: string) {
    const supabase = createClient();

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File is too large (max 2MB)');
    }

    const filePath = `${wsId}/users/${generateRandomUUID()}`;

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

  const onSubmit = async (formData: z.infer<typeof FormSchema>) => {
    setSaving(true);
    try {
      let avatarUrl = previewSrc;

      if (file) {
        avatarUrl = await uploadImageToSupabase(file, wsId);
      }

      const res = await fetch(
        formData.id
          ? `/api/v1/workspaces/${wsId}/users/${formData.id}`
          : `/api/v1/workspaces/${wsId}/users`,
        {
          method: formData.id ? 'PUT' : 'POST',
          body: JSON.stringify({
            ...formData,
            avatar_url: avatarUrl,
            birthday: dayjs(formData.birthday).format('YYYY/MM/DD'),
          }),
        }
      );

      if (res.ok) {
        onFinish?.(formData);
        router.refresh();
      } else {
        const resData = await res.json();
        toast({
          title: `Failed to ${formData.id ? 'edit' : 'create'} user`,
          description: resData.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${formData.id ? 'edit' : 'create'} user`,
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const name = form.watch('display_name') || form.watch('full_name');

  return (
    <>
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

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
          <ScrollArea className="grid h-[50vh] gap-3 border-b">
            {data?.id && (
              <>
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
                        The identification number of this user in your
                        workspace. This is automatically managed by Tuturuuu,
                        and cannot be changed.
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <Separator />
              </>
            )}

            <div className="flex items-center gap-2 rounded-md border p-4">
              <Avatar>
                <AvatarImage src={previewSrc || data?.avatar_url || ''} />
                <AvatarFallback className="font-semibold">
                  {name ? getInitials(name) : <UserIcon className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>

              <div>
                <Button variant="ghost" type="button" className="mt-2">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    {previewSrc
                      ? t('settings-account.new_avatar')
                      : t('settings-account.upload_avatar')}
                  </label>
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
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
                  <FormDescription>The real name of this user.</FormDescription>
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
                        { value: 'MALE', label: 'Male' },
                        { value: 'FEMALE', label: 'Female' },
                        { value: 'OTHER', label: 'Other' },
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
          </ScrollArea>

          <div className="flex justify-center gap-2">
            <Button type="submit" className="w-full">
              Save changes
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
