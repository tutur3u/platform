'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Globe, LockKeyhole, RefreshCw } from '@tuturuuu/icons';
import {
  getMeetPublicInfoSettings,
  updateMeetPublicInfoSettings,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { encodeRoomCode } from '../lib/room-code';
import { MeetSettingsCard, MeetSettingsToggle } from './meet-settings-card';

export function MeetingPublicSettings({ meetingId }: { meetingId: string }) {
  const t = useTranslations('meet.public');
  const id = useId();
  const client = useQueryClient();
  const key = ['meet-public-settings', meetingId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getMeetPublicInfoSettings(meetingId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateMeetPublicInfoSettings(meetingId, enabled),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const enabled = query.data?.publicLinkPreview === true;
  return (
    <MeetSettingsCard>
      <MeetSettingsToggle
        id={id}
        icon={
          enabled ? (
            <Globe className="size-4" />
          ) : (
            <LockKeyhole className="size-4" />
          )
        }
        label={t('setting_title')}
        hint={t('setting_hint')}
        checked={enabled}
        disabled={!query.data || mutation.isPending}
        onCheckedChange={(value) => mutation.mutate(value)}
      />
      {query.data && (
        <div className="grid gap-1 rounded-lg bg-muted/40 p-4 text-sm">
          <p className="text-muted-foreground text-xs">{t('preview_label')}</p>
          <p className="break-words font-medium">
            {enabled ? query.data.title : t('private_title')}
          </p>
          <p className="text-muted-foreground text-xs">
            {enabled ? t('public_status') : t('private_status')}
          </p>
        </div>
      )}
      {(query.isError || mutation.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {t('save_error')}
        </p>
      )}
      {(query.isError || enabled) && (
        <div className="flex flex-wrap gap-2">
          {query.isError && (
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="size-4" />
              {t('retry')}
            </Button>
          )}
          {enabled && (
            <Button asChild size="sm" variant="outline">
              <a
                href={`/r/${encodeRoomCode(meetingId)}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" />
                {t('open_invite')}
              </a>
            </Button>
          )}
        </div>
      )}
    </MeetSettingsCard>
  );
}
