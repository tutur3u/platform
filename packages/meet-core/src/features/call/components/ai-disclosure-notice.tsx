'use client';

import { useTranslations } from 'next-intl';
import type { MeetAiDisclosure } from '../../meeting-ai/ai-disclosure-state';
import { MeetAiLegalLinks } from './meet-ai-legal-links';

export function AiDisclosureNotice({
  disclosure,
  audience,
}: {
  disclosure: MeetAiDisclosure;
  audience: 'member' | 'guest';
}) {
  const t = useTranslations('meet_ai_notice');
  if (disclosure.kind === 'active')
    return (
      <div
        role="status"
        className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm"
      >
        <p className="font-medium">{t('active_title')}</p>
        {disclosure.transcription ? <p>{t('active_transcription')}</p> : null}
        {disclosure.mira ? <p>{t('active_mira')}</p> : null}
        <MeetAiLegalLinks />
      </div>
    );
  if (audience === 'guest')
    return (
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
        {disclosure.kind === 'error' ? <p role="alert">{t('error')}</p> : null}
        <p>{t('guest')}</p>
        <MeetAiLegalLinks />
      </div>
    );
  if (disclosure.kind === 'hidden') return null;
  return (
    <div className="space-y-2 text-muted-foreground text-sm">
      <p role={disclosure.kind === 'error' ? 'alert' : 'status'}>
        {t(disclosure.kind)}
      </p>
      {disclosure.kind === 'available' ? <MeetAiLegalLinks /> : null}
    </div>
  );
}
