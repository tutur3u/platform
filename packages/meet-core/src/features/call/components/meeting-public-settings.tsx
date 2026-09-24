'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Globe, LockKeyhole } from '@tuturuuu/icons';
import {
  getMeetPublicInfoSettings,
  updateMeetPublicInfoSettings,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { encodeRoomCode } from '../lib/room-code';

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
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={id} className="flex items-center gap-2">
            {enabled ? (
              <Globe className="size-4" />
            ) : (
              <LockKeyhole className="size-4" />
            )}
            {t('setting_title')}
          </Label>
          <p className="max-w-prose text-muted-foreground text-xs">
            {t('setting_hint')}
          </p>
        </div>
        <Switch
          id={id}
          checked={enabled}
          disabled={!query.data || mutation.isPending}
          onCheckedChange={(value) => mutation.mutate(value)}
        />
      </div>
      {query.data && (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="text-muted-foreground text-xs">{t('preview_label')}</p>
          <p className="mt-1 break-words font-medium">
            {enabled ? query.data.title : t('private_title')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {enabled ? t('public_status') : t('private_status')}
          </p>
        </div>
      )}
      {(query.isError || mutation.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {t('save_error')}
        </p>
      )}
      {query.isError && (
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          {t('retry')}
        </Button>
      )}
      {enabled && (
        <Button asChild variant="link" className="h-auto p-0">
          <a
            href={`/r/${encodeRoomCode(meetingId)}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('open_invite')}
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      )}
    </section>
  );
}
