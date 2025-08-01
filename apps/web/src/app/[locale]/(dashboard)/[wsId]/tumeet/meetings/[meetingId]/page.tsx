import { MeetingActions } from './meeting-actions';
import { RecordingSessionActions } from './recording-session-actions';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Mic,
  Play,
  Users,
} from '@tuturuuu/ui/icons';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { format } from 'date-fns';
import Link from 'next/link';
import { redirect } from 'next/navigation';

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
      ),
      recording_sessions(
        id,
        status,
        created_at,
        updated_at,
        recording_transcriptions(
          text,
          created_at
        )
      )
    `
    )
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .single();

  if (error || !meeting) {
    redirect(`/${wsId}/tumeet/meetings`);
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      recording: { variant: 'default' as const, label: 'Recording' },
      interrupted: { variant: 'destructive' as const, label: 'Interrupted' },
      pending_transcription: {
        variant: 'secondary' as const,
        label: 'Pending',
      },
      transcribing: { variant: 'secondary' as const, label: 'Transcribing' },
      completed: { variant: 'default' as const, label: 'Completed' },
      failed: { variant: 'destructive' as const, label: 'Failed' },
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] ||
      statusConfig.recording;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

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
            <h1 className="text-3xl font-bold tracking-tight">
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

          <div className="flex gap-2">
            <Button className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Join Meeting
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Start Recording
            </Button>
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
              {meeting.recording_sessions.length > 0
                ? `${meeting.recording_sessions.length} recording session(s)`
                : 'No recordings yet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {meeting.recording_sessions.length === 0 ? (
              <p className="text-muted-foreground">
                No recordings have been made for this meeting yet.
              </p>
            ) : (
              <div className="space-y-3">
                {meeting.recording_sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Mic className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(session.status)}
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(session.created_at), 'MMM d, p')}
                          </span>
                        </div>
                        {session.recording_transcriptions && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Transcription available
                          </p>
                        )}
                      </div>
                    </div>
                    <RecordingSessionActions
                      wsId={wsId}
                      meetingId={meetingId}
                      sessionId={session.id}
                      hasTranscription={!!session.recording_transcriptions}
                      transcriptionText={session.recording_transcriptions?.text}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="mt-8">
        <MeetingActions
          wsId={wsId}
          meetingId={meetingId}
          meetingName={meeting.name}
        />
      </div>
    </div>
  );
}
