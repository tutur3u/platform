'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Copy } from '@tuturuuu/icons';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useCopyToClipboard } from '@tuturuuu/ui/hooks/use-copy-to-clipboard';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import {
  ProfileAvatarEditor,
  satelliteProfileQueryKey,
} from './profile-avatar-editor';
import { ProfileFieldForm } from './profile-field-form';

export function SatelliteProfileSettingsPanel({
  user,
}: {
  user: WorkspaceUser;
}) {
  const t = useTranslations('settings-account');
  const profileQuery = useQuery({
    placeholderData: {
      id: user.id,
      avatar_url: user.avatar_url ?? null,
      created_at: user.created_at ?? new Date(0).toISOString(),
      default_workspace_id: null,
      display_name: user.display_name ?? null,
      email: user.email ?? null,
      full_name: user.full_name ?? null,
      new_email: user.new_email ?? null,
    },
    queryFn: () => getCurrentUserProfile(),
    queryKey: [...satelliteProfileQueryKey],
    staleTime: 30_000,
  });
  const profile = profileQuery.data;
  const { copyToClipboard, isCopied } = useCopyToClipboard({ timeout: 2000 });

  if (!profile) return <ProfileSkeleton />;

  return (
    <div className="grid gap-6">
      <SettingItemTab title={t('avatar')} description={t('avatar-description')}>
        <ProfileAvatarEditor profile={profile} />
      </SettingItemTab>
      <div className="rounded-xl border bg-card/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t('account-status')}</p>
            <p className="text-muted-foreground text-sm">
              {t('account-status-description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge>{t('active')}</Badge>
            <Badge variant="secondary">{t('verified')}</Badge>
          </div>
        </div>
      </div>
      <SettingItemTab
        title={t('user-id')}
        description={t('user-id-description')}
      >
        <div className="flex w-full items-center gap-2">
          <Input disabled value={profile.id} />
          <Button
            className="shrink-0"
            size="icon"
            type="button"
            variant="outline"
            onClick={() => copyToClipboard(profile.id)}
          >
            {isCopied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
      </SettingItemTab>
      <SettingItemTab
        title={t('display-name')}
        description={t('display-name-description')}
      >
        <ProfileFieldForm
          field="display_name"
          initialValue={profile.display_name}
        />
      </SettingItemTab>
      <SettingItemTab
        title={t('full-name')}
        description={t('full-name-description')}
      >
        <ProfileFieldForm
          field="full_name"
          initialValue={profile.full_name}
          placeholder={
            profile.full_name ? undefined : (profile.display_name ?? undefined)
          }
        />
      </SettingItemTab>
      <SettingItemTab
        title={t('email-address')}
        description={t('email-description')}
      >
        <div className="w-full space-y-2">
          <ProfileFieldForm field="email" initialValue={profile.email} />
          {profile.new_email ? (
            <p className="text-muted-foreground text-xs">
              {t('check-email-verify', { email: profile.new_email })}
            </p>
          ) : null}
        </div>
      </SettingItemTab>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
