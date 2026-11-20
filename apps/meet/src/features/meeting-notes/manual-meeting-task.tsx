'use client';

import { FollowupReview } from '@tuturuuu/meet-core/features/meeting-ai/followup-review';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ManualMeetingTask({
  wsId,
  meetingId,
}: {
  wsId: string;
  meetingId: string;
}) {
  const t = useTranslations('meet.ai');
  const [draftId, setDraftId] = useState<string | null>(null);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setDraftId(crypto.randomUUID())}
      >
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
