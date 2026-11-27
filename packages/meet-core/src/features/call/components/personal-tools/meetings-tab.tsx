'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Video } from '@tuturuuu/icons';
import { LoadingRegion, SkeletonList } from '@tuturuuu/ui/skeleton';
import { useFormatter, useTranslations } from 'next-intl';
import {
  loadPersonalMeetings,
  type PersonalMeetingItem,
  type PersonalTabSnapshot,
  type PersonalToolsApi,
  type PersonalToolsSnapshot,
  personalToolsApi,
  personalToolsFailureKeepsSnapshot,
} from '../../lib/personal-tools';
import { PersonalAppLinkButton, resolveSafePersonalAppUrl } from './shared';

export function PersonalMeetingsTab({
  accountId,
  workspace,
  active,
  api = personalToolsApi,
}: {
  accountId: string;
  workspace: PersonalToolsSnapshot['workspace'];
  active: boolean;
  api?: PersonalToolsApi;
}) {
  const t = useTranslations('meet.call.private_tools');
  const format = useFormatter();
  const cache = useQueryClient();
  const queryKey = [
    'meet-personal-tools',
    accountId,
    workspace.id,
    'meetings',
  ] as const;

  const query = useQuery({
    queryKey,
    enabled: active,
    queryFn: () =>
      loadPersonalMeetings(
        accountId,
        workspace.id,
        api,
        cache.getQueryData<PersonalTabSnapshot<PersonalMeetingItem[]>>(queryKey)
      ),
    gcTime: 0,
    staleTime: 30_000,
    refetchInterval: active ? 60_000 : false,
    retry: false,
  });

  const isTransientError =
    query.isError && personalToolsFailureKeepsSnapshot(query.error);
  const snapshot =
    query.isError && !isTransientError ? null : query.data;
  const isStale =
    snapshot?.status === 'stale' ||
    (isTransientError && Boolean(snapshot?.items));
  const href = resolveSafePersonalAppUrl('meet', workspace);

  return (
    <div>
      <PersonalAppLinkButton href={href} label={t('open_meetings')} />
      {query.isPending ? (
        <LoadingRegion srLabel={t('loading_tab')} className="space-y-2">
          <SkeletonList rows={3} withAvatar={false} />
        </LoadingRegion>
      ) : !snapshot || snapshot.status === 'unavailable' || !snapshot.items ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t('tab_unavailable')}
        </p>
      ) : (
        <>
          {isStale && (
            <p role="status" className="mb-2 text-muted-foreground text-xs">
              {t('stale_meetings')}
            </p>
          )}
          {!snapshot.items.length ? (
            <p className="text-muted-foreground text-sm">
              {t('empty_meetings')}
            </p>
          ) : (
            <ul className="space-y-1">
              {snapshot.items.map((meeting) => {
                const timestamp =
                  meeting.calendar_event?.start_at ??
                  meeting.time ??
                  meeting.created_at;
                return (
                  <li
                    key={meeting.id}
                    className="flex items-start gap-2 rounded-lg px-2 py-2.5"
                  >
                    <Video className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm">
                        {meeting.name || t('meeting_untitled')}
                      </p>
                      {timestamp && (
                        <p className="mt-0.5 text-muted-foreground text-xs">
                          {format.dateTime(new Date(timestamp), {
                            weekday: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
