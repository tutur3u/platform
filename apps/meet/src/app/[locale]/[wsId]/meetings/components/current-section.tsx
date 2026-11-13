'use client';

import { Video } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { encodeRoomCode } from '@/features/call/lib/room-code';
import type { LiveMeeting } from './types';

/** Rendered only for meetings a presence source reports live. */
export function CurrentSection({ meetings }: { meetings: LiveMeeting[] }) {
  const t = useTranslations('meet.meetings');
  return (
    <section aria-labelledby="meetings-current" className="space-y-3">
      <h2
        className="flex items-center gap-2 font-semibold text-base tracking-tight"
        id="meetings-current"
      >
        <span
          aria-hidden
          className="size-2 rounded-full bg-dynamic-green motion-safe:animate-pulse"
        />
        {t('section_current')}
      </h2>
      <ul className="divide-y overflow-hidden rounded-xl border border-dynamic-green/30 bg-dynamic-green/5">
        {meetings.map((meeting) => (
          <li
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center md:px-5"
            key={meeting.id}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{meeting.name}</p>
              <p className="text-muted-foreground text-sm">
                {t('in_call', { count: meeting.participantCount })}
              </p>
            </div>
            <Button asChild>
              <Link href={`/r/${encodeRoomCode(meeting.id)}`}>
                <Video className="size-4" />
                {t(meeting.viewerJoined ? 'rejoin' : 'join_now')}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
