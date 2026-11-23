'use client';
import { FollowupReview } from '../../meeting-ai/followup-review';

/**
 * A host's follow-up task for a meeting that left no notes or transcript. The
 * ended page's More menu opens it with a fresh `draftId`; without a notes
 * reader this is the only way to reach the action.
 */
export function EndedManualTask({
  wsId,
  meetingId,
  draftId,
  onClose,
}: {
  wsId: string;
  meetingId: string;
  draftId: string | null;
  onClose: () => void;
}) {
  if (!draftId) return null;
  return (
    <FollowupReview
      suggestion={{
        key: `${meetingId}:manual:${draftId}`,
        kind: 'task',
        source: 'manual',
        title: '',
        evidence: '',
        owner: null,
        timeText: null,
        startLocal: null,
        endLocal: null,
        timezone: null,
      }}
      wsId={wsId}
      meetingId={meetingId}
      onClose={onClose}
    />
  );
}
