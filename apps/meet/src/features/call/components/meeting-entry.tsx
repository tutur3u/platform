'use client';

import { createWorkspaceMeeting } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { parseMeetingCode } from '../lib/meeting-code-input';
import { encodeRoomCode } from '../lib/room-code';

export function MeetingEntry({
  canCreate,
  wsId,
}: {
  canCreate: boolean;
  wsId: string;
}) {
  const t = useTranslations('meet.call');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (busy || !canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createWorkspaceMeeting<{ meeting: { id: string } }>(
        wsId,
        { name: t('untitled_meeting'), time: new Date().toISOString() }
      );
      router.push(`/r/${encodeRoomCode(result.meeting.id)}`);
    } catch {
      setError(t('start_failed'));
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 space-y-3 rounded-xl border p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Button disabled={!canCreate || busy} onClick={() => void start()}>
          {busy ? t('starting_meeting') : t('start_meeting')}
        </Button>
        <form
          className="flex flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const meetingId = parseMeetingCode(code, window.location.origin);
            if (!meetingId) {
              setError(t('invalid_code'));
              return;
            }
            router.push(`/r/${encodeRoomCode(meetingId)}`);
          }}
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="join-code">{t('enter_code')}</Label>
            <Input
              id="join-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={!code.trim()}>
            {t('join_now')}
          </Button>
        </form>
      </div>
      {!canCreate && (
        <p className="text-muted-foreground text-sm">
          {t('creation_restricted')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-dynamic-red text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
