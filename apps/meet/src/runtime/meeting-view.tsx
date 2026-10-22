import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Users,
  Video,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CALENDAR_URL } from '@/constants/common';
import { CallEnded } from '@/features/call/components/call-ended';
import { MeetingLocalTime } from '@/features/call/components/meeting-local-time';
import { MeetingPublicSettings } from '@/features/call/components/meeting-public-settings';
import { buildCalendarEventUrl } from '@/features/call/lib/calendar-link';
import { encodeRoomCode } from '@/features/call/lib/room-code';
import { MeetingAiOverview } from '@/features/meeting-ai/meeting-ai-overview';
import { MeetingActions } from '../app/[locale]/[wsId]/meetings/[meetingId]/meeting-actions';
import { RecordingSessionsOverview } from '../app/[locale]/[wsId]/meetings/[meetingId]/recording-sessions-overview';
import { MeetingDurationInfo } from './meeting-duration-view';

import type { MeetPageModel } from './page-model.server';

type DetailModel = Extract<MeetPageModel, { kind: 'meeting' }>;
export function MeetingView({ model }: { model: DetailModel }) {
  const {
    workspace: { user, workspaceSlug, wsId },
    detail: { meeting, isHost, policy },
  } = model;
  const meetingId = meeting.id;
  const t = useTranslations('meet.call');
  const details = useTranslations('meet.details');
  if (model.detail.kind === 'ended')
    return (
      <CallEnded
        accountId={user.id}
        canManage={isHost}
        canReadNotes={policy.canReadNotes}
        shareNotesAfterMeeting={policy.settings?.shareNotesAfterMeeting}
        meetingId={meetingId}
        wsId={wsId}
        meetingName={meeting.name ?? t('untitled_meeting')}
        backHref={`/${workspaceSlug}/meetings`}
      />
    );
  const { calendarEvent, durationSeconds } = model.detail;
  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <Button asChild variant="ghost" className="mb-4">
          <Link href={`/${workspaceSlug}/meetings`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {details('back')}
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="break-words font-bold text-3xl tracking-tight">
              {meeting.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <MeetingLocalTime value={meeting.time} pattern="PPP" />
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <MeetingLocalTime value={meeting.time} pattern="p" />
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {meeting.creator.display_name}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        {policy.canReadNotes && (
          <MeetingAiOverview wsId={wsId} meetingId={meetingId} />
        )}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{details('info')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium">{details('name')}</h4>
              <p className="text-muted-foreground">{meeting.name}</p>
            </div>
            <div>
              <h4 className="font-medium">{details('scheduled')}</h4>
              <p className="text-muted-foreground">
                <MeetingLocalTime value={meeting.time} pattern="PPP p" />
              </p>
            </div>
            <div>
              <h4 className="font-medium">{details('creator')}</h4>
              <p className="text-muted-foreground">
                {meeting.creator.display_name}
              </p>
            </div>
            <div>
              <h4 className="font-medium">{details('created')}</h4>
              <p className="text-muted-foreground">
                <MeetingLocalTime value={meeting.created_at} pattern="PPP p" />
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{details('recordings')}</CardTitle>
            <CardDescription>{details('recordings_hint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <RecordingSessionsOverview wsId={wsId} meetingId={meetingId} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <MeetingDurationInfo seconds={durationSeconds} />
      </div>
      {isHost && (
        <div className="mt-6">
          <MeetingPublicSettings meetingId={meetingId} />
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link href={`/r/${encodeRoomCode(meetingId)}`}>
            <Video className="mr-2 h-4 w-4" />
            {t('join_call')}
          </Link>
        </Button>
        {calendarEvent && (
          <Button asChild size="lg" variant="outline">
            <a
              href={buildCalendarEventUrl(
                CALENDAR_URL,
                workspaceSlug,
                calendarEvent
              )}
              rel="noreferrer"
              target="_blank"
            >
              <Calendar className="mr-2 h-4 w-4" />
              {t('open_in_calendar')}
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        <MeetingActions wsId={wsId} meetingId={meetingId} />
      </div>
    </div>
  );
}
