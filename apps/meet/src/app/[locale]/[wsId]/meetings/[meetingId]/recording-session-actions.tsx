'use client';

import { EyeIcon, Headphones } from '@tuturuuu/icons';
import type { RecordingStatus, RecordingTranscript } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRecordingLoader } from '@/hooks/useRecordingLoader';
import { AudioPlayer } from './components/AudioPlayer';
import { DeleteConfirmation } from './components/DeleteConfirmation';
import { TranscriptViewer } from './components/TranscriptViewer';

interface RecordingSession {
  id: string;
  status: RecordingStatus;
  created_at: string;
  updated_at: string;
  can_manage?: boolean;
  transcript?: RecordingTranscript | null;
}

interface RecordingSessionActionsProps {
  wsId: string;
  meetingId: string;
  session: RecordingSession;
  onDelete?: () => void; // Optional callback for parent
}

export function RecordingSessionActions({
  wsId,
  meetingId,
  session,
  onDelete,
}: RecordingSessionActionsProps) {
  const t = useTranslations('meet.transcription');
  // Dialog states
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [audioPlayerDialogOpen, setAudioPlayerDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Legacy recordings are never transcribed: speaker consent cannot be
  // verified for them (the server refuses too). Meet AI is the consented path.
  const { audioRecording, isLoadingChunks, loadError, loadRecording } =
    useRecordingLoader({
      wsId,
      meetingId,
      sessionId: session.id,
    });

  const handlePlayRecording = async () => {
    try {
      await loadRecording();
      setAudioPlayerDialogOpen(true);
    } catch {
      // Error is already handled in the hook
      setAudioPlayerDialogOpen(false);
    }
  };

  const handleViewTranscript = () => {
    setTranscriptDialogOpen(true);
  };

  return (
    <>
      <div className="flex gap-2">
        {session.transcript ? (
          <Button variant="outline" size="sm" onClick={handleViewTranscript}>
            <EyeIcon className="mr-1 h-3 w-3" />
            View Transcript
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePlayRecording}
          disabled={isLoadingChunks}
        >
          <Headphones className="mr-1 h-3 w-3" />
          {isLoadingChunks ? 'Loading...' : 'Play'}
        </Button>
        {session.can_manage && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete
          </Button>
        )}
      </div>

      {!session.transcript && session.can_manage && (
        <p className="text-muted-foreground text-sm">{t('legacy_disabled')}</p>
      )}
      {/* Extracted Components */}
      <TranscriptViewer
        isOpen={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
        transcript={session.transcript || null}
        sessionId={session.id}
        sessionCreatedAt={session.created_at}
      />

      <AudioPlayer
        isOpen={audioPlayerDialogOpen}
        onOpenChange={setAudioPlayerDialogOpen}
        audioRecording={audioRecording}
        isLoadingChunks={isLoadingChunks}
        loadError={loadError}
        onRetry={handlePlayRecording}
      />

      <DeleteConfirmation
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        wsId={wsId}
        meetingId={meetingId}
        sessionId={session.id}
        onDeleteSuccess={onDelete}
      />
    </>
  );
}
