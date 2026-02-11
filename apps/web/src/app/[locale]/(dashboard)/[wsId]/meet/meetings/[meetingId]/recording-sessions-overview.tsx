'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, FileText, Mic } from '@tuturuuu/icons';
import type { RecordingStatus, RecordingTranscript } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { RecordingSessionActions } from './recording-session-actions';

interface RecordingSession {
  id: string;
  status: RecordingStatus;
  created_at: string;
  updated_at: string;
  transcript?: RecordingTranscript | null;
}

interface RecordingSessionsOverviewProps {
  wsId: string;
  meetingId: string;
}

// Fetch recording sessions
const fetchRecordingSessions = async (
  wsId: string,
  meetingId: string
): Promise<RecordingSession[]> => {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings`
  );
  if (!response.ok) {
    throw new Error('Failed to fetch recording sessions');
  }
  const data = await response.json();
  return data.sessions || [];
};

const getStatusColor = (status: RecordingStatus) => {
  switch (status) {
    case 'recording':
      return 'bg-dynamic-red text-white';
    case 'completed':
      return 'bg-dynamic-green text-white';
    case 'pending_transcription':
      return 'bg-dynamic-orange text-white';
    case 'transcribing':
      return 'bg-dynamic-blue text-white';
    case 'failed':
      return 'bg-dynamic-red/20 text-dynamic-red';
    case 'interrupted':
      return 'bg-dynamic-orange/20 text-dynamic-orange';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getStatusText = (status: RecordingStatus) => {
  switch (status) {
    case 'recording':
      return 'Recording';
    case 'completed':
      return 'Completed';
    case 'pending_transcription':
      return 'Pending Transcription';
    case 'transcribing':
      return 'Transcribing';
    case 'failed':
      return 'Failed';
    case 'interrupted':
      return 'Interrupted';
    default:
      return 'Unknown';
  }
};

const getDuration = (session: RecordingSession) => {
  const start = new Date(session.created_at);
  const end = new Date(session.updated_at);
  const durationMs = end.getTime() - start.getTime();
  const minutes = Math.floor(durationMs / (1000 * 60));
  const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function RecordingSessionsOverview({
  wsId,
  meetingId,
}: RecordingSessionsOverviewProps) {
  const queryClient = useQueryClient();

  const {
    data: sessions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['recording-sessions', wsId, meetingId],
    queryFn: () => fetchRecordingSessions(wsId, meetingId),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute for real-time updates
  });

  const handleSessionDeleted = () => {
    // Invalidate and refetch the recording sessions
    queryClient.invalidateQueries({
      queryKey: ['recording-sessions', wsId, meetingId],
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dynamic-blue border-t-transparent" />
          <p className="mt-2 text-muted-foreground">Loading recordings...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <p className="text-dynamic-red">Failed to load recordings</p>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Mic className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 font-semibold text-lg">No Recordings Yet</h3>
          <p className="text-center text-muted-foreground">
            Start recording this meeting to capture audio and generate
            transcripts.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Recording Sessions</h3>
        <Badge variant="outline">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="grid gap-4">
        {sessions.map((session) => (
          <Card key={session.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mic className="h-4 w-4" />
                  Recording Session
                </CardTitle>
                <Badge className={getStatusColor(session.status)}>
                  {getStatusText(session.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Started:</span>
                  <span className="font-medium text-xs">
                    {formatDistanceToNow(new Date(session.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Duration:</span>
                  <span>{getDuration(session)}</span>
                </div>
              </div>

              {session.transcript && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-dynamic-green" />
                  <span className="font-medium text-dynamic-green">
                    Transcript available
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 border-t pt-2">
                <RecordingSessionActions
                  wsId={wsId}
                  meetingId={meetingId}
                  session={session}
                  onDelete={handleSessionDeleted}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
