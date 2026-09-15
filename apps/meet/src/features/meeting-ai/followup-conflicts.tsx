'use client';
import { useQuery } from '@tanstack/react-query';
import { getMeetFollowupConflicts } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { localTimeToIso } from './followup-time';
export function FollowupConflicts({
  wsId,
  meetingId,
  workspaceId,
  timezone,
  start,
  end,
}: {
  wsId: string;
  meetingId: string;
  workspaceId?: string;
  timezone: string;
  start: string;
  end: string;
}) {
  const t = useTranslations('meet.ai');
  let range: { startAt: string; endAt: string } | null = null;
  try {
    const startAt = localTimeToIso(start, timezone);
    const endAt = localTimeToIso(end, timezone);
    if (startAt < endAt) range = { startAt, endAt };
  } catch {
    /* The review form explains invalid wall times. */
  }
  const query = useQuery({
    queryKey: [
      'meet-followup-conflicts',
      wsId,
      meetingId,
      workspaceId,
      range?.startAt,
      range?.endAt,
    ],
    queryFn: () =>
      getMeetFollowupConflicts(
        wsId,
        meetingId,
        workspaceId!,
        range!.startAt,
        range!.endAt
      ),
    enabled: !!workspaceId && !!range,
    retry: false,
    gcTime: 0,
  });
  if (!range || !workspaceId) return null;
  return (
    <p role="status" className="text-muted-foreground text-xs">
      {t(
        query.isFetching
          ? 'followup_conflicts_loading'
          : query.isError
            ? 'followup_conflicts_unknown'
            : query.data?.count
              ? 'followup_conflicts_found'
              : 'followup_conflicts_clear',
        { count: query.data?.count ?? 0 }
      )}
    </p>
  );
}
