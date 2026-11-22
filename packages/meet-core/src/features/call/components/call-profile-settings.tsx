'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, RefreshCw } from '@tuturuuu/icons';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import {
  ProfileAvatarEditor,
  satelliteProfileQueryKey,
} from '@tuturuuu/satellite/account-settings';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../lib/room-controller';
import { CallDisplayNameCard } from './call-display-name-card';
import {
  MeetSettingsCard,
  MeetSettingsHeading,
  MeetSettingsStack,
} from './meet-settings-card';

/**
 * Profile page of the call settings, for signed-in participants. The photo
 * editor is the one every satellite's account settings use; the name card
 * also renames this participant in the live room.
 */
export function CallProfileSettings({
  room,
  siteKey,
}: {
  room: Pick<MeetRoomController, 'previewDisplayName' | 'renameSelf' | 'state'>;
  siteKey?: string;
}) {
  const accountT = useTranslations('settings-account');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();
  const self = room.state.selfUserId
    ? room.state.participants[room.state.selfUserId]
    : undefined;
  const profile = useQuery({
    queryFn: () => getCurrentUserProfile(),
    queryKey: [...satelliteProfileQueryKey],
    staleTime: 30_000,
  });
  const data = profile.data;
  const avatarUrl = data?.avatar_url ?? self?.avatarUrl;

  return (
    <MeetSettingsStack>
      <MeetSettingsCard aria-labelledby="meet-profile-photo-title">
        <MeetSettingsHeading
          id="meet-profile-photo-title"
          icon={<ImageIcon className="size-4" />}
          title={accountT('avatar')}
          description={accountT('avatar-description')}
        />
        {data ? (
          <ProfileAvatarEditor profile={data} />
        ) : profile.isError ? (
          <Button
            className="w-fit"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void profile.refetch()}
          >
            <RefreshCw className="size-4" />
            {commonT('retry')}
          </Button>
        ) : (
          <Skeleton className="h-16 w-48" />
        )}
      </MeetSettingsCard>
      <CallDisplayNameCard
        room={room}
        savedName={data?.display_name || self?.displayName || ''}
        avatarUrl={avatarUrl}
        siteKey={siteKey}
        onProfileSaved={() =>
          void queryClient.invalidateQueries({
            queryKey: [...satelliteProfileQueryKey],
          })
        }
      />
    </MeetSettingsStack>
  );
}
