'use client';
import { ListPlus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FollowupReview } from '../../meeting-ai/followup-review';

/**
 * A host's follow-up task for a meeting that left no notes or transcript. The
 * notes reader carries this action when it exists; without a reader the ended
 * page offers it here so it stays reachable.
 */
export function EndedManualTask({
  wsId,
  meetingId,
  disabled,
}: {
  wsId: string;
  meetingId: string;
  disabled?: boolean;
}) {
  const t = useTranslations('meet.ai');
  const [draftId, setDraftId] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => setDraftId(crypto.randomUUID())}
      >
        <ListPlus className="size-4" />
        {t('manual_task')}
      </Button>
      {draftId && (
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
          onClose={() => setDraftId(null)}
        />
      )}
    </>
  );
}
