'use client';

import { useMutation } from '@tanstack/react-query';
import {
  CheckCircle,
  Info,
  Loader2,
  Lock,
  Upload,
  UserCog,
} from '@tuturuuu/icons';
import {
  submitUserProfileLink,
  uploadUserProfileLinkAvatar,
} from '@tuturuuu/internal-api/users';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
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
  requiresAuth: boolean;
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
      <Label htmlFor={htmlFor} className="font-medium text-sm">
        {label}
      </Label>
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

/** Shared page chrome: centered card on a soft gradient, comfortable on mobile. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-linear-to-b from-background via-dynamic-blue/5 to-dynamic-purple/10 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </div>
  );
}

export default function ProfileFillContent({
  code,
  allowedFields,
  prefill,
  prefillExistingValues,
  requiresAuth,
  actorEmail,
}: Props) {
  const t = useTranslations('ws-user-profile-links');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<ProfileLinkField>>(
    () => new Set()
  );
  const emailLocked = requiresAuth;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of allowedFields) {
      initial[field] =
        field === 'email' && emailLocked
          ? (actorEmail ?? '')
          : (prefill[field] ?? '');
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
        if (field === 'email' && emailLocked) {
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
      <PageShell>
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-dynamic-green/10">
            <CheckCircle className="h-8 w-8 text-dynamic-green" />
          </span>
          <h1 className="font-semibold text-2xl">
            {t('public_success_title')}
          </h1>
          <p className="text-muted-foreground">
            {t('public_success_description')}
          </p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card className="p-5 sm:p-7">
        <header className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-dynamic-blue/10 text-dynamic-blue">
            <UserCog className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <h1 className="font-semibold text-xl sm:text-2xl">
              {t('public_title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('public_description')}
            </p>
          </div>
        </header>

        {!prefillExistingValues ? (
          <p className="mt-4 rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
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
                  <AvatarFallback>
                    <UserCog className="h-6 w-6 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
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
                className="h-11"
                autoComplete="nickname"
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
                className="h-11"
                autoComplete="name"
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
                className="h-11"
                autoComplete="bday"
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
                <SelectTrigger id="gender" className="h-11">
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
                tooltip={emailLocked ? t('field_email_locked_hint') : undefined}
              />
              {emailLocked ? (
                <>
                  <div className="relative">
                    <Input
                      id="email"
                      className="h-11 pr-9"
                      value={actorEmail ?? ''}
                      disabled
                      readOnly
                    />
                    <Lock className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('field_email_locked_hint')}
                  </p>
                </>
              ) : (
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="h-11"
                  value={values.email ?? ''}
                  onChange={(e) => setValue('email', e.target.value)}
                />
              )}
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
                inputMode="tel"
                autoComplete="tel"
                className="h-11"
                value={values.phone ?? ''}
                onChange={(e) => setValue('phone', e.target.value)}
              />
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full"
            disabled={submitMutation.isPending || avatarUploading}
          >
            {submitMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t('public_submit')}
          </Button>
        </form>
      </Card>
    </PageShell>
  );
}
