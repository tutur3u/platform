'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle, Info, Loader2, Upload } from '@tuturuuu/icons';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ProfileLinkField } from '@/features/user-profile-links/server';

interface Props {
  code: string;
  mode: 'per_user' | 'generic';
  allowedFields: ProfileLinkField[];
  prefill: Partial<Record<ProfileLinkField, string | null>>;
  prefillExistingValues: boolean;
  actorEmail: string | null;
}

function FieldLabel({
  htmlFor,
  label,
  tooltip,
}: {
  htmlFor?: string;
  label: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export default function ProfileFillContent({
  code,
  allowedFields,
  prefill,
  prefillExistingValues,
  actorEmail,
}: Props) {
  const t = useTranslations('ws-user-profile-links');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<ProfileLinkField>>(
    () => new Set()
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of allowedFields) {
      initial[field] =
        field === 'email' ? (actorEmail ?? '') : (prefill[field] ?? '');
    }
    return initial;
  });

  const has = (field: ProfileLinkField) => allowedFields.includes(field);
  const setValue = (field: ProfileLinkField, value: string) => {
    setTouchedFields((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const submitMutation = useMutation({
    mutationFn: () => {
      const fields: Record<string, string | null> = {};
      for (const field of allowedFields) {
        if (field === 'email') {
          fields[field] = actorEmail ?? null;
          continue;
        }

        if (!touchedFields.has(field)) continue;

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
      {!prefillExistingValues ? (
        <p className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          {t('public_existing_values_hidden')}
        </p>
      ) : null}

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          submitMutation.mutate();
        }}
      >
        {has('avatar_url') && (
          <div className="space-y-2">
            <FieldLabel
              label={t('field_avatar_url')}
              tooltip={t('field_avatar_hint')}
            />
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
            <FieldLabel
              htmlFor="display_name"
              label={t('field_display_name')}
            />
            <Input
              id="display_name"
              value={values.display_name ?? ''}
              onChange={(e) => setValue('display_name', e.target.value)}
            />
          </div>
        )}

        {has('full_name') && (
          <div className="space-y-2">
            <FieldLabel htmlFor="full_name" label={t('field_full_name')} />
            <Input
              id="full_name"
              value={values.full_name ?? ''}
              onChange={(e) => setValue('full_name', e.target.value)}
            />
          </div>
        )}

        {has('birthday') && (
          <div className="space-y-2">
            <FieldLabel htmlFor="birthday" label={t('field_birthday')} />
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
            <FieldLabel htmlFor="gender" label={t('field_gender')} />
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
            <FieldLabel
              htmlFor="email"
              label={t('field_email')}
              tooltip={t('field_email_locked_hint')}
            />
            <Input id="email" value={actorEmail ?? ''} disabled readOnly />
            <p className="text-muted-foreground text-xs">
              {t('field_email_locked_hint')}
            </p>
          </div>
        )}

        {has('phone') && (
          <div className="space-y-2">
            <FieldLabel
              htmlFor="phone"
              label={t('field_phone')}
              tooltip={t('field_phone_hint')}
            />
            <Input
              id="phone"
              type="tel"
              value={values.phone ?? ''}
              onChange={(e) => setValue('phone', e.target.value)}
            />
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
