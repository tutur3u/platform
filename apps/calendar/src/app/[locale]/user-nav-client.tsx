'use client';

import SharedUserNavClient from '@tuturuuu/satellite/user-nav-client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { useParams } from 'next/navigation';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { TTR_URL } from '@/constants/common';

export default function UserNavClient({
  user,
  locale,
  hideMetadata = false,
}: {
  user: WorkspaceUser | null;
  locale: string | undefined;
  hideMetadata?: boolean;
}) {
  const params = useParams();
  const wsId = params?.wsId as string | undefined;

  return (
    <SharedUserNavClient
      user={user}
      locale={locale}
      hideMetadata={hideMetadata}
      appName="Calendar"
      ttrUrl={TTR_URL}
      settingsDialog={
        user ? <SettingsDialog wsId={wsId} user={user} /> : undefined
      }
    />
  );
}
