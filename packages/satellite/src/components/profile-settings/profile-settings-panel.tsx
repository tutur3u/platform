'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Copy } from '@tuturuuu/icons';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { AccountProfilePanel } from '@tuturuuu/ui/custom/account-profile-panel';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useCopyToClipboard } from '@tuturuuu/ui/hooks/use-copy-to-clipboard';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { resolveProfileNamePlaceholders } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import {
  ProfileAvatarEditor,
  satelliteProfileQueryKey,
} from './profile-avatar-editor';
import { ProfileEmailLinkOut } from './profile-email-link-out';
import { ProfileFieldForm } from './profile-field-form';

export function SatelliteProfileSettingsPanel({
  centralUrl,
  user,
}: {
  /** Web app origin; email changes happen in the web settings dialog. */
  centralUrl: string;
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
  const namePlaceholders = resolveProfileNamePlaceholders(profile);

  return (
    <AccountProfilePanel
      avatar={{
        title: t('avatar'),
        description: t('avatar-description'),
        control: <ProfileAvatarEditor profile={profile} />,
      }}
      displayName={{
        title: t('display-name'),
        description: t('display-name-description'),
        control: (
          <ProfileFieldForm
            field="display_name"
            initialValue={profile.display_name}
            placeholder={namePlaceholders.displayName}
          />
        ),
      }}
      fullName={{
        title: t('full-name'),
        description: t('full-name-description'),
        control: (
          <ProfileFieldForm
            field="full_name"
            initialValue={profile.full_name}
            placeholder={namePlaceholders.fullName}
          />
        ),
      }}
      email={{
        title: t('email-address'),
        description: t('email-description'),
        control: (
          <div className="w-full space-y-2">
            <ProfileEmailLinkOut
              centralUrl={centralUrl}
              email={profile.email}
            />
            {profile.new_email ? (
              <p className="text-muted-foreground text-sm">
                {t('check-email-verify', { email: profile.new_email })}
              </p>
            ) : null}
          </div>
        ),
      }}
      accountSection={
        <SettingsSection>
          <SettingItemTab
            title={t('account-status')}
            description={t('account-status-description')}
          >
            <div className="flex gap-2">
              <Badge variant="success">{t('active')}</Badge>
              <Badge variant="outline">{t('verified')}</Badge>
            </div>
          </SettingItemTab>
          <SettingItemTab
            controlWidth="2xl"
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
        </SettingsSection>
      }
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
