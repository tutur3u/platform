'use client';

import { useQuery } from '@tanstack/react-query';
import { PencilLine } from '@tuturuuu/icons';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { PublicProfileCard } from '@tuturuuu/ui/custom/public-profile-card';
import { SHARED_SETTINGS_TAB_IDS } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getPublicProfilePath } from '@tuturuuu/utils/public-profile-url';
import { useTranslations } from 'next-intl';
import { satelliteProfileQueryKey } from '../profile-settings/profile-avatar-editor';

/**
 * The signed-in user's public profile inside the settings dialog. It renders
 * the same card as `/u/[username]` and never touches the page address: the
 * dialog state stays in `?settingsTab=public_profile`, so tabs can be switched
 * and the dialog closed like any other tab.
 */
export function PublicProfileSettingsPanel(
  // Kept for existing callers; the card builds its own public link.
  _props: {
    /** @deprecated No longer used; the address is not rewritten. */
    centralUrl?: string;
  } = {}
) {
  const t = useTranslations('public_profile');
  const { openSettings } = useSettingsDialogUrlState();
  const profileQuery = useQuery({
    queryFn: () => getCurrentUserProfile(),
    queryKey: [...satelliteProfileQueryKey],
    staleTime: 30_000,
  });
  const profile = profileQuery.data;
  const profilePath = getPublicProfilePath(profile?.handle);
  const username = profilePath ? profilePath.slice('/u/'.length) : null;

  const editProfile = (
    <Button
      type="button"
      variant="outline"
      onClick={() => openSettings(SHARED_SETTINGS_TAB_IDS.profile)}
    >
      <PencilLine className="size-4" aria-hidden="true" />
      {t('edit_profile')}
    </Button>
  );

  if (profileQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-40 w-full rounded-2xl sm:h-56" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <p role="alert" className="text-muted-foreground text-sm">
        {t('load_failed')}
      </p>
    );
  }

  if (!username) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5">
        <p className="text-muted-foreground text-sm">{t('no_username')}</p>
        {editProfile}
      </div>
    );
  }

  return (
    <PublicProfileCard
      headingLevel="h2"
      profile={{
        avatar_url: profile.avatar_url ?? null,
        banner_url: profile.banner_url ?? null,
        bio: profile.bio ?? null,
        display_name: profile.display_name ?? null,
      }}
      username={username}
      labels={{
        copyFailed: t('copyFailed'),
        copyLink: t('copyLink'),
        linkCopied: t('linkCopied'),
        manualCopyLink: t('manualCopyLink'),
        title: t('title'),
      }}
      actions={editProfile}
    />
  );
}
