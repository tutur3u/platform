'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { getWorkspaceMeetings } from '@tuturuuu/internal-api';
import { useMemo } from 'react';
import { classifyMeetings } from './section-rules';
import type {
  MeetingsHomeSchedule,
  OlderMeetings,
  ScheduledMeeting,
} from './types';

export const MEETINGS_PAGE_SIZE = 50;

/** Workspace meetings list response, newest meeting time first. */
interface MeetingsResponse {
  meetings: {
    id: string;
    name: string;
    time: string | null;
    created_at: string;
    creator_id: string;
    calendar_event?: { id: string; start_at: string; end_at: string } | null;
  }[];
  totalCount: number;
}

function toScheduledMeeting(
  meeting: MeetingsResponse['meetings'][number]
): ScheduledMeeting {
  return {
    calendar: meeting.calendar_event
      ? {
          endAt: meeting.calendar_event.end_at,
          id: meeting.calendar_event.id,
          startAt: meeting.calendar_event.start_at,
        }
      : null,
    createdAt: meeting.created_at,
    creatorId: meeting.creator_id,
    id: meeting.id,
    name: meeting.name,
    time: meeting.time,
  };
}

export function meetingsQueryPrefix(wsId: string, accountId: string) {
  return ['meetings', wsId, accountId, 'home'] as const;
}

/** Paged meetings for one actor and workspace; `search` narrows server-side. */
export function useMeetingPages({
  wsId,
  accountId,
  search,
  enabled,
}: {
  wsId: string;
  accountId: string;
  search: string;
  enabled: boolean;
}) {
  const query = useInfiniteQuery({
    enabled: enabled && Boolean(accountId),
    gcTime: 15 * 60_000,
    getNextPageParam: (last, _pages, lastPage) =>
      lastPage * MEETINGS_PAGE_SIZE < last.totalCount
        ? lastPage + 1
        : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getWorkspaceMeetings<MeetingsResponse>(wsId, {
        page: pageParam,
        pageSize: MEETINGS_PAGE_SIZE,
        search,
      }),
    queryKey: [...meetingsQueryPrefix(wsId, accountId), search],
    staleTime: 30_000,
  });
  const pages = query.data?.pages;
  const meetings = useMemo(
    () => pages?.flatMap((page) => page.meetings.map(toScheduledMeeting)),
    [pages]
  );
  const older: OlderMeetings = !query.hasNextPage
    ? { kind: 'complete' }
    : query.isFetchingNextPage
      ? { kind: 'loading' }
      : query.isFetchNextPageError
        ? { kind: 'failed' }
        : { kind: 'available' };
  return { meetings, older, query };
}

/**
 * Schedule from the list endpoint. It has no presence source, so Current is
 * always unavailable, and the browser timezone presents times.
 */
export function scheduleFromMeetings(
  meetings: ScheduledMeeting[],
  evaluatedAt: string
): MeetingsHomeSchedule {
  const { upcoming, past } = classifyMeetings(meetings, evaluatedAt);
  return {
    calendarAccess: meetings.some((meeting) => meeting.calendar)
      ? { status: 'available' }
      : { status: 'unavailable' },
    current: [],
    currentSource: 'unavailable',
    evaluatedAt,
    past,
    upcoming,
    viewerTimezone: { source: 'browser', timeZone: null },
  };
}
