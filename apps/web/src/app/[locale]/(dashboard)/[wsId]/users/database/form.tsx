'use client';

import { Info, Loader2, UserIcon } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { SelectField } from '@tuturuuu/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';
import * as z from 'zod';
import { ImageCropper } from '@/components/image-cropper';
import { DatePicker } from '@/components/row-actions/users/date-picker';
import { useUserStatusLabels } from '@/hooks/use-user-status-labels';

interface Props {
  wsId: string;
  data?: WorkspaceUser;

  onFinish?: (data: z.infer<typeof FormSchema>) => void;

  onSuccess?: () => void;

  onError?: (error: string) => void;
  showUserID?: boolean;
  canCreateUsers?: boolean;
  canUpdateUsers?: boolean;
}

const FormSchema = z.object({
  id: z.string().optional(),
  full_name: z.string().optional(),
  display_name: z.string().optional(),
  email: z.email().optional(),
  phone: z.string().optional(),
  gender: z.string().optional(),
  // gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthday: z.date().optional(),
  ethnicity: z.string().optional(),
  guardian: z.string().optional(),
  national_id: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
  is_guest: z.boolean().optional(),
  archived: z.boolean().optional(),
  archived_until: z.date().optional(),
});

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const AVATAR_SIZE = 500;

// Helper component for labels with tooltips
function LabelWithTooltip({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3 w-3 cursor-help text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default function UserForm({
  wsId,
  data,
  onFinish,
  onSuccess,
  onError,
  showUserID = true,
  canCreateUsers = true,
  canUpdateUsers = true,
}: Props) {
  const t = useTranslations();
  const userStatusLabels = useUserStatusLabels(wsId);
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
      // Initialize from provided data (if present), else undefined so edits don't change unless toggled
      is_guest:
        (data as unknown as { is_guest?: boolean })?.is_guest ?? undefined,
      archived:
        (data as unknown as { archived?: boolean })?.archived ?? undefined,
      archived_until:
        data?.archived_until &&
        !Number.isNaN(new Date(data.archived_until).getTime())
          ? new Date(data.archived_until)
          : undefined,
    },
  });

  // Watch archived_until to auto-set archived status
  const archivedUntilValue = form.watch('archived_until');
  React.useEffect(() => {
    if (archivedUntilValue) {
      form.setValue('archived', true);
    }
  }, [archivedUntilValue, form]);

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
      toast.error(t('settings-account.crop_failed'), {
        description:
          error instanceof Error
            ? error.message
            : t('settings-account.crop_failed_description'),
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
      toast.error(t('settings-account.crop_failed'), {
        description: t('settings-account.crop_failed_description'),
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
      const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
      throw new Error(
        t('qr.image_upload.file_too_large', { size: `${maxSizeMB}MB` })
      );
    }

    const filePath = `${wsId}/users/${generateRandomUUID()}`;

    const { error } = await supabase.storage
      .from('workspaces')
      .upload(filePath, file);

    if (error) {
      console.error('Error uploading file:', error.message);
      throw new Error(t('qr.image_upload.upload_failed'));
    }

    const { data, error: signedURLError } = await supabase.storage
      .from('workspaces')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (signedURLError) {
      console.error('Error generating signed URL:', signedURLError.message);
      throw new Error(t('qr.image_upload.signed_url_failed'));
    }

    return data.signedUrl;
  }

  const onSubmit = async (formData: z.infer<typeof FormSchema>) => {
    // Check permissions before submitting
    const isCreating = !data?.id;
    const hasPermission = isCreating ? canCreateUsers : canUpdateUsers;

    if (!hasPermission) {
      toast.error(t('common.insufficient_permissions'));
      return;
    }

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
          headers: {
            'Content-Type': 'application/json',
          },
          body: (() => {
            const { is_guest, archived, archived_until, ...rest } =
              formData as any;
            const payload: Record<string, unknown> = {
              ...rest,
              avatar_url: avatarUrl,
              birthday: formData.birthday
                ? dayjs(formData.birthday).format('YYYY/MM/DD')
                : null,
            };
            if (typeof is_guest === 'boolean') {
              payload.is_guest = is_guest;
            }
            if (typeof archived === 'boolean') {
              payload.archived = archived;
            }
            if (archived_until) {
              payload.archived_until = dayjs(archived_until).format(
                'YYYY/MM/DD HH:mm:ss'
              );
            }

            return JSON.stringify(payload);
          })(),
        }
      );

      if (res.ok) {
        // Surface any server-side warnings (e.g., failed guest linking)
        try {
          const body = await res.json();
          if (body?.warning) {
            toast.warning(body.warning);
          }
        } catch {}
        onFinish?.(formData);
        onSuccess?.();
        if (!onSuccess) {
          router.refresh();
        }
      } else {
        const resData = await res.json();
        const errorMessage =
          resData.message ||
          t(formData.id ? 'ws-users.failed_edit' : 'ws-users.failed_create');
        onError?.(errorMessage);
        if (!onError) {
          toast.error(
            t(formData.id ? 'ws-users.failed_edit' : 'ws-users.failed_create'),
            {
              description: errorMessage,
            }
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      onError?.(errorMessage);
      if (!onError) {
        toast.error(
          t(formData.id ? 'ws-users.failed_edit' : 'ws-users.failed_create'),
          {
            description: errorMessage,
          }
        );
      }
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 border-b p-1 md:grid-cols-2">
            {/* User ID - Full width when editing */}
            {data?.id && showUserID && (
              <div className="col-span-2">
                <FormField
                  control={form.control}
                  name="id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <LabelWithTooltip
                          label={t('ws-users.user_id')}
                          tooltip={t('ws-users.user_id_tooltip')}
                        />
                      </FormLabel>
                      <FormControl>
                        <Input {...field} disabled />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Avatar Section - Full width */}
            <div className="col-span-2 flex items-center gap-2 rounded-md border p-4">
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

            {/* Name Fields - 2 columns */}
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.full_name')}
                      tooltip={t('ws-users.full_name_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('ws-users.placeholder.name')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.display_name')}
                      tooltip={t('ws-users.display_name_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('ws-users.placeholder.name')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Contact Fields - 2 columns */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.email')}
                      tooltip={t('ws-users.email_tooltip')}
                    />
                  </FormLabel>
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
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.phone')}
                      tooltip={t('ws-users.phone_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('ws-users.placeholder.phone')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Personal Info - 2 columns */}
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.gender')}
                      tooltip={t('ws-users.gender_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <SelectField
                      id="gender"
                      placeholder={t('ws-users.gender_placeholder')}
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      options={[
                        {
                          value: 'MALE',
                          label: t('ws-users.gender_options.male'),
                        },
                        {
                          value: 'FEMALE',
                          label: t('ws-users.gender_options.female'),
                        },
                        {
                          value: 'OTHER',
                          label: t('ws-users.gender_options.other'),
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
                <FormItem>
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.birthday')}
                      tooltip={t('ws-users.birthday_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <DatePicker
                      value={
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

            {/* Additional Info - 2 columns */}
            <FormField
              control={form.control}
              name="national_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.national_id')}
                      tooltip={t('ws-users.national_id_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t('common.empty')} {...field} />
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
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.ethnicity')}
                      tooltip={t('ws-users.ethnicity_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t('common.empty')} {...field} />
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
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.guardian')}
                      tooltip={t('ws-users.guardian_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t('common.empty')} {...field} />
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
                  <FormLabel>
                    <LabelWithTooltip
                      label={t('ws-users.address')}
                      tooltip={t('ws-users.address_tooltip')}
                    />
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t('common.empty')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes - Full width */}
            <div className="col-span-2">
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <LabelWithTooltip
                        label={t('ws-users.note')}
                        tooltip={t('ws-users.note_tooltip')}
                      />
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t('common.empty')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Guest User - Full width */}
            <div className="col-span-2">
              <FormField
                control={form.control}
                name="is_guest"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <LabelWithTooltip
                        label={t('ws-users.guest_user')}
                        tooltip={t('ws-users.guest_user_tooltip')}
                      />
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                        <span className="text-muted-foreground text-sm">
                          {t('ws-users.mark_as_guest')}
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Archived Status - Only show when editing */}
            {data?.id && (
              <div className="col-span-1">
                <FormField
                  control={form.control}
                  name="archived"
                  render={({ field }) => (
                    <FormItem className="gap-4">
                      <FormLabel>
                        <LabelWithTooltip
                          label={userStatusLabels.permanently_archived}
                          tooltip={t('ws-users.archived_user_tooltip')}
                        />
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                            disabled={!!archivedUntilValue}
                          />
                          <span className="text-muted-foreground text-sm">
                            {t('ws-users.mark_as_archived')}
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Archived At - Only show when editing */}
            {data?.id && (
              <div className="col-span-1">
                <FormField
                  control={form.control}
                  name="archived_until"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <LabelWithTooltip
                          label={userStatusLabels.archived_until}
                          tooltip={t('ws-users.archived_at_tooltip')}
                        />
                      </FormLabel>
                      <FormControl>
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
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2">
            <Button
              type="submit"
              className="w-full"
              disabled={
                saving || (data?.id ? !canUpdateUsers : !canCreateUsers)
              }
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : data?.id ? (
                t('common.save')
              ) : (
                t('ws-users.create')
              )}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
