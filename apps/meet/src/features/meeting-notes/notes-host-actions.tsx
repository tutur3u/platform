'use client';

import type { MeetAiSession } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const RETRY_GRACE_MS = 120_000;

/** Host-only finish and retry controls, matching the in-call panel rules. */
export function NotesHostActions({
  sessions,
  busy,
  onFinish,
}: {
  sessions: MeetAiSession[];
  busy: boolean;
  onFinish: (sessionId: string) => void;
}) {
  const t = useTranslations('meet.ai');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const active = sessions.find((session) => !session.ended_at);
  const retryable = sessions.filter(
    (session) => session.ended_at && session.notes_status !== 'completed'
  );
  if (!active && !retryable.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {active ? (
        <Button
          disabled={busy}
          variant="secondary"
          onClick={() => onFinish(active.id)}
        >
          {t('finish')}
        </Button>
      ) : null}
      {retryable.map((session) => (
        <Button
          key={session.id}
          disabled={
            busy ||
            (session.notes_status === 'processing' &&
              (!session.notes_started_at ||
                now - Date.parse(session.notes_started_at) < RETRY_GRACE_MS))
          }
          variant="secondary"
          onClick={() => onFinish(session.id)}
        >
          {t('retry_notes')}
        </Button>
      ))}
    </div>
  );
}
