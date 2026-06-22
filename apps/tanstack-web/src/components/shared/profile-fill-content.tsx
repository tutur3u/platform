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
import { useRef, useState } from 'react';
import type { Locale } from '../../lib/platform/locale';
import type { ProfileLinkField } from '../../lib/platform/profile-links';

/**
 * Translation strings for the public profile-completion fill page.
 *
 * The legacy apps/web component resolves these from the
 * `ws-user-profile-links` next-intl namespace. That namespace is not present
 * in the apps/tanstack-web message bundle, so the strings are inlined here
 * (English + Vietnamese, copied verbatim from the legacy apps/web message
 * bundles) and resolved by `locale` — mirroring the `DocumentPageContent`
 * pattern. If the shared namespace is later added to apps/tanstack-web's
 * bundle this map can be swapped for the platform `getMessages` helper.
 */
export type ProfileFillMessages = {
  public_title: string;
  public_description: string;
  public_existing_values_hidden: string;
  public_success_title: string;
  public_success_description: string;
  public_submit: string;
  public_submit_error: string;
  public_avatar_uploaded: string;
  public_avatar_error: string;
  field_avatar_url: string;
  field_avatar_hint: string;
  field_avatar_upload: string;
  field_display_name: string;
  field_full_name: string;
  field_birthday: string;
  field_gender: string;
  field_gender_placeholder: string;
  gender_male: string;
  gender_female: string;
  gender_other: string;
  field_email: string;
  field_email_locked_hint: string;
  field_phone: string;
  field_phone_hint: string;
};

const profileFillMessagesByLocale: Record<Locale, ProfileFillMessages> = {
  en: {
    public_title: 'Complete your profile',
    public_description:
      'Fill in the details below. Your changes are saved to the workspace.',
    public_existing_values_hidden:
      'The workspace has hidden existing values for this request. Fill only the details you want to update.',
    public_success_title: 'Thank you!',
    public_success_description:
      'Your profile details have been submitted successfully.',
    public_submit: 'Submit',
    public_submit_error: 'Failed to submit. Please try again.',
    public_avatar_uploaded: 'Photo uploaded',
    public_avatar_error: 'Failed to upload photo',
    field_avatar_url: 'Profile photo',
    field_avatar_hint:
      'Uploading a new photo replaces the current profile photo.',
    field_avatar_upload: 'Upload photo',
    field_display_name: 'Display name',
    field_full_name: 'Full name',
    field_birthday: 'Birthday',
    field_gender: 'Gender',
    field_gender_placeholder: 'Select gender',
    gender_male: 'Male',
    gender_female: 'Female',
    gender_other: 'Other',
    field_email: 'Email',
    field_email_locked_hint:
      'This is your logged-in account email and cannot be changed.',
    field_phone: 'Phone',
    field_phone_hint:
      'Use the phone number the workspace should use to contact you.',
  },
  vi: {
    public_title: 'Hoàn tất hồ sơ của bạn',
    public_description:
      'Điền các thông tin bên dưới. Thay đổi của bạn sẽ được lưu vào không gian làm việc.',
    public_existing_values_hidden:
      'Không gian làm việc đã ẩn giá trị hiện có cho yêu cầu này. Chỉ điền những thông tin bạn muốn cập nhật.',
    public_success_title: 'Cảm ơn bạn!',
    public_success_description:
      'Thông tin hồ sơ của bạn đã được gửi thành công.',
    public_submit: 'Gửi',
    public_submit_error: 'Gửi không thành công. Vui lòng thử lại.',
    public_avatar_uploaded: 'Đã tải ảnh lên',
    public_avatar_error: 'Không thể tải ảnh lên',
    field_avatar_url: 'Ảnh đại diện',
    field_avatar_hint: 'Tải ảnh mới lên sẽ thay thế ảnh đại diện hiện tại.',
    field_avatar_upload: 'Tải ảnh lên',
    field_display_name: 'Tên hiển thị',
    field_full_name: 'Họ và tên',
    field_birthday: 'Ngày sinh',
    field_gender: 'Giới tính',
    field_gender_placeholder: 'Chọn giới tính',
    gender_male: 'Nam',
    gender_female: 'Nữ',
    gender_other: 'Khác',
    field_email: 'Email',
    field_email_locked_hint:
      'Đây là email tài khoản đã đăng nhập của bạn và không thể thay đổi.',
    field_phone: 'Số điện thoại',
    field_phone_hint:
      'Dùng số điện thoại mà không gian làm việc nên dùng để liên hệ với bạn.',
  },
};

export function getProfileFillMessages(locale: Locale): ProfileFillMessages {
  return profileFillMessagesByLocale[locale];
}

export interface ProfileFillContentProps {
  code: string;
  mode: 'per_user' | 'generic';
  allowedFields: ProfileLinkField[];
  prefill: Partial<Record<ProfileLinkField, string | null>>;
  prefillExistingValues: boolean;
  requiresAuth: boolean;
  actorEmail: string | null;
  locale: Locale;
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

export function ProfileFillContent({
  code,
  allowedFields,
  prefill,
  prefillExistingValues,
  requiresAuth,
  actorEmail,
  locale,
}: ProfileFillContentProps) {
  const t = getProfileFillMessages(locale);
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
        error instanceof Error ? error.message : t.public_submit_error
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
      toast.success(t.public_avatar_uploaded);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t.public_avatar_error
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
          <h1 className="font-semibold text-2xl">{t.public_success_title}</h1>
          <p className="text-muted-foreground">
            {t.public_success_description}
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
              {t.public_title}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t.public_description}
            </p>
          </div>
        </header>

        {!prefillExistingValues ? (
          <p className="mt-4 rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
            {t.public_existing_values_hidden}
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
                label={t.field_avatar_url}
                tooltip={t.field_avatar_hint}
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
                  {t.field_avatar_upload}
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
              <FieldLabel htmlFor="display_name" label={t.field_display_name} />
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
              <FieldLabel htmlFor="full_name" label={t.field_full_name} />
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
              <FieldLabel htmlFor="birthday" label={t.field_birthday} />
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
              <FieldLabel htmlFor="gender" label={t.field_gender} />
              <Select
                value={values.gender || undefined}
                onValueChange={(value) => setValue('gender', value)}
              >
                <SelectTrigger id="gender" className="h-11">
                  <SelectValue placeholder={t.field_gender_placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{t.gender_male}</SelectItem>
                  <SelectItem value="FEMALE">{t.gender_female}</SelectItem>
                  <SelectItem value="OTHER">{t.gender_other}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {has('email') && (
            <div className="space-y-2">
              <FieldLabel
                htmlFor="email"
                label={t.field_email}
                tooltip={emailLocked ? t.field_email_locked_hint : undefined}
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
                    {t.field_email_locked_hint}
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
                label={t.field_phone}
                tooltip={t.field_phone_hint}
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
            {t.public_submit}
          </Button>
        </form>
      </Card>
    </PageShell>
  );
}
