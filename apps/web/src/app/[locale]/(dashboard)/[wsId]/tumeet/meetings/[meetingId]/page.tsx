import { ArrowLeft, Calendar, Clock, Users } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { format } from 'date-fns';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MeetingActions } from './meeting-actions';
import { RecordingSessionsOverview } from './recording-sessions-overview';

export const metadata: Metadata = {
  title: 'Meeting Details',
  description:
    'Manage Meeting Details in the Meetings area of your Tuturuuu workspace.',
};

interface MeetingDetailPageProps {
  params: Promise<{
    wsId: string;
    meetingId: string;
  }>;
}

export default async function MeetingDetailPage({
  params,
}: MeetingDetailPageProps) {
  const { wsId, meetingId } = await params;
  const user = await getCurrentUser();

  if (!user?.id) redirect('/login');

  const supabase = await createClient();

  // Verify workspace access
  const { data: memberCheck } = await supabase
    .from('workspace_members')
    .select('id:user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();

  if (!memberCheck) {
    redirect('/onboarding');
  }

  // Fetch meeting details
  const { data: meeting, error } = await supabase
    .from('workspace_meetings')
    .select(
      `
      *,
      creator:users!workspace_meetings_creator_id_fkey(
        display_name
      )
    `
    )
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .single();

  if (error || !meeting) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-8">
        <Link href={`/${wsId}/tumeet/meetings`}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Meetings
          </Button>
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-bold text-3xl tracking-tight">
              {meeting.name}
            </h1>
            <div className="mt-2 flex items-center gap-4 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {format(new Date(meeting.time), 'PPP')}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {format(new Date(meeting.time), 'p')}
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {meeting.creator.display_name}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meeting Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Meeting Info */}
        <Card>
          <CardHeader>
            <CardTitle>Meeting Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium">Name</h4>
              <p className="text-muted-foreground">{meeting.name}</p>
            </div>
            <div>
              <h4 className="font-medium">Scheduled Time</h4>
              <p className="text-muted-foreground">
                {format(new Date(meeting.time), 'PPP p')}
              </p>
            </div>
            <div>
              <h4 className="font-medium">Created By</h4>
              <p className="text-muted-foreground">
                {meeting.creator.display_name}
              </p>
            </div>
            <div>
              <h4 className="font-medium">Created</h4>
              <p className="text-muted-foreground">
                {format(new Date(meeting.created_at), 'PPP p')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Recording Sessions */}
        <Card>
          <CardHeader>
            <CardTitle>Recordings</CardTitle>
            <CardDescription>
              Audio recordings and transcripts from this meeting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecordingSessionsOverview wsId={wsId} meetingId={meetingId} />
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="mt-8">
        <MeetingActions wsId={wsId} meetingId={meetingId} />
      </div>
    </div>
  );
}
