'use client';

import type { MeetTranscriptConsent } from '@tuturuuu/internal-api';
import { Users } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { CaptureModePicker } from './capture-mode-picker';
import { SelfCaptureStatus } from './self-capture-status';
import { SelfCoverage } from './self-coverage';
import type { SelfCaptureState } from './self-lifecycle';
import { SELF_NOTICE_KEYS } from './self-notice-text';
import type { SelfRoomView } from './self-room';

type Fence = Extract<MeetTranscriptConsent, { available: true }>['fence'];

/**
 * What the transcript notice explains: the room-capture fence, or in a
 * per-speaker meeting the per-speaker notice and this person's own state.
 * Managers also get coverage and the (locked) capture mode.
 */
export function TranscriptConsentDetails({
  room,
  fence,
  capture,
  names,
  meetingId,
  wsId,
}: {
  room: SelfRoomView;
  fence: Fence;
  capture: SelfCaptureState | undefined;
  names: Record<string, string>;
  meetingId: string;
  wsId?: string;
}) {
  const t = useTranslations('meet.ai');
  const solo = room.mode === 'self';
  return (
    <>
      <div className="space-y-1">
        <h2 className="font-medium">{t('consent_title')}</h2>
        {solo ? (
          SELF_NOTICE_KEYS.map((key) => (
            <p
              key={key}
              className={`text-muted-foreground ${key === 'self_readers' ? 'text-xs' : ''}`}
            >
              {t(key)}
            </p>
          ))
        ) : (
          <>
            <p className="text-muted-foreground">{t('consent_body')}</p>
            <p className="text-muted-foreground text-xs">
              {t('consent_readers')}
            </p>
          </>
        )}
      </div>
      {solo ? (
        capture && <SelfCaptureStatus state={capture} />
      ) : (
        <p role="status" className="flex items-center gap-1.5 text-xs">
          <Users aria-hidden className="size-3.5 text-muted-foreground" />
          {fence.ready
            ? t('consent_everyone')
            : t('consent_waiting', { count: fence.pending })}
          <span className="text-muted-foreground">
            {t('consent_count', {
              allowed: fence.admitted - fence.pending,
              total: fence.admitted,
            })}
          </span>
        </p>
      )}
      {solo && room.canManageMode && (
        <SelfCoverage coverage={room.coverage} names={names} />
      )}
      {wsId && (
        <CaptureModePicker wsId={wsId} meetingId={meetingId} room={room} />
      )}
    </>
  );
}
