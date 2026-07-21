'use client';

import { Bot } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { Reveal } from '../shared/reveal';
import { SectionShell } from '../shared/section-shell';
import { AiCapabilities } from './ai-capabilities';
import { AiCoreSystems } from './ai-core-systems';
import { AiPipeline } from './ai-pipeline';
import { MiraShowcase } from './mira-showcase';

/**
 * The full AI story, in four beats: the partner you talk to (Mira), the systems
 * behind her, how a request flows through them, and what that produces.
 */
export function AISection() {
  const t = useTranslations('landing.aiCapabilities');

  return (
    <SectionShell
      bloom="purple"
      eyebrow={
        <>
          <Bot className="h-3 w-3 text-dynamic-purple" />
          {t('eyebrow')}
        </>
      }
      id="ai"
      index="05"
      subtitle={t('subtitle')}
      title={t('title')}
    >
      <div className="grid gap-20 sm:gap-24">
        <Reveal blur direction="scale">
          <MiraShowcase />
        </Reveal>

        <AiCoreSystems />

        <AiPipeline />

        <AiCapabilities />
      </div>
    </SectionShell>
  );
}
