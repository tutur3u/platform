'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TTR_URL } from '../../../constants/common';
import {
  MEET_AI_LEGAL_REVISION,
  meetAiLegalLinks,
} from '../../meeting-ai/ai-legal-links';

export function MeetAiLegalLinks() {
  const locale = useLocale();
  const t = useTranslations('meet_ai_notice');
  const links = meetAiLegalLinks(locale, TTR_URL);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {(['privacy', 'terms', 'subprocessors'] as const).map((kind) => (
        <a
          key={kind}
          href={links[kind]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          {t(`links_${kind}`)}
        </a>
      ))}
      {MEET_AI_LEGAL_REVISION.date ? (
        <span>{t('links_updated', { date: MEET_AI_LEGAL_REVISION.date })}</span>
      ) : null}
    </div>
  );
}
