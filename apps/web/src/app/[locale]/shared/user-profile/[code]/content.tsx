'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle, Loader2, Upload } from '@tuturuuu/icons';
import {
  submitUserProfileLink,
  uploadUserProfileLinkAvatar,
} from '@tuturuuu/internal-api/users';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ProfileLinkField } from '@/features/user-profile-links/server';

interface Props {
  code: string;
  mode: 'per_user' | 'generic';
  allowedFields: ProfileLinkField[];
  prefill: Partial<Record<ProfileLinkField, string | null>>;
  actorEmail: string | null;
}

export default function ProfileFillContent({
  code,
  allowedFields,
  prefill,
  actorEmail,
}: Props) {
  const t = useTranslations('ws-user-profile-links');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of allowedFields) {
      initial[field] =
        field === 'email' ? (actorEmail ?? '') : (prefill[field] ?? '');
    }
    return initial;
  });

  const has = (field: ProfileLinkField) => allowedFields.includes(field);
  const setValue = (field: string, value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const submitMutation = useMutation({
    mutationFn: () => {
      const fields: Record<string, string | null> = {};
      for (const field of allowedFields) {
        if (field === 'avatar_url') {
          fields[field] = values[field] || null;
          continue;
        }
        fields[field] = values[field]?.trim() ? values[field] : null;
      }

      return submitUserProfileLink(code, { fields });
    },
    onSuccess: () => setSubmitted(true),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('public_submit_error')
      ),
  });

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { publicUrl } = await uploadUserProfileLinkAvatar(code, file);
      setValue('avatar_url', publicUrl);
      toast.success(t('public_avatar_uploaded'));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('public_avatar_error')
      );
    } finally {
      setAvatarUploading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md space-y-3 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-dynamic-green" />
          <h1 className="font-semibold text-2xl">
            {t('public_success_title')}
          </h1>
          <p className="text-muted-foreground">
            {t('public_success_description')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-4 py-10">
      <h1 className="font-semibold text-2xl">{t('public_title')}</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        {t('public_description')}
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          submitMutation.mutate();
        }}
      >
        {has('avatar_url') && (
          <div className="space-y-2">
            <Label>{t('field_avatar_url')}</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={values.avatar_url || undefined} />
                <AvatarFallback>?</AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="outline"
                disabled={avatarUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {t('field_avatar_upload')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </div>
        )}

        {has('display_name') && (
          <div className="space-y-2">
            <Label htmlFor="display_name">{t('field_display_name')}</Label>
            <Input
              id="display_name"
              value={values.display_name ?? ''}
              onChange={(e) => setValue('display_name', e.target.value)}
            />
          </div>
        )}

        {has('full_name') && (
          <div className="space-y-2">
            <Label htmlFor="full_name">{t('field_full_name')}</Label>
            <Input
              id="full_name"
              value={values.full_name ?? ''}
              onChange={(e) => setValue('full_name', e.target.value)}
            />
          </div>
        )}

        {has('birthday') && (
          <div className="space-y-2">
            <Label htmlFor="birthday">{t('field_birthday')}</Label>
            <Input
              id="birthday"
              type="date"
              value={values.birthday ?? ''}
              onChange={(e) => setValue('birthday', e.target.value)}
            />
          </div>
        )}

        {has('gender') && (
          <div className="space-y-2">
            <Label htmlFor="gender">{t('field_gender')}</Label>
            <Select
              value={values.gender || undefined}
              onValueChange={(value) => setValue('gender', value)}
            >
              <SelectTrigger id="gender">
                <SelectValue placeholder={t('field_gender_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">{t('gender_male')}</SelectItem>
                <SelectItem value="FEMALE">{t('gender_female')}</SelectItem>
                <SelectItem value="OTHER">{t('gender_other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {has('email') && (
          <div className="space-y-2">
            <Label htmlFor="email">{t('field_email')}</Label>
            <Input id="email" value={actorEmail ?? ''} disabled readOnly />
            <p className="text-muted-foreground text-xs">
              {t('field_email_locked_hint')}
            </p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={submitMutation.isPending || avatarUploading}
        >
          {submitMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {t('public_submit')}
        </Button>
      </form>
    </div>
  );
}
