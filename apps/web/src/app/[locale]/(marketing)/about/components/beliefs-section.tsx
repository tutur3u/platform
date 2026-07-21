import {
  Globe,
  Heart,
  Lightbulb,
  Shield,
  Target,
  Zap,
} from '@tuturuuu/icons/lucide';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import {
  type SurfaceAccent,
  SurfaceCard,
} from '@/components/landing/shared/surface-card';
import { useAboutTranslations } from './use-about-translations';

const beliefs: Array<{
  key: string;
  icon: ComponentType<{ className?: string }>;
  accent: SurfaceAccent;
}> = [
  { key: 'focus', icon: Zap, accent: 'yellow' },
  { key: 'technology', icon: Heart, accent: 'red' },
  { key: 'transparency', icon: Shield, accent: 'blue' },
  { key: 'impact', icon: Target, accent: 'green' },
  { key: 'potential', icon: Globe, accent: 'purple' },
  { key: 'thirdEra', icon: Lightbulb, accent: 'orange' },
];

/** The principles the product decisions are argued from. */
export function BeliefsSection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      eyebrow={t('sections.beliefs.eyebrow')}
      index="02"
      subtitle={t('coreBeliefs.subtitle')}
      title={`${t('coreBeliefs.title.part1')} ${t('coreBeliefs.title.highlight')}`}
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.06}
      >
        {beliefs.map((belief) => (
          <RevealItem className="h-full" key={belief.key}>
            <SurfaceCard
              accent={belief.accent}
              description={t(`coreBeliefs.${belief.key}.description`)}
              icon={belief.icon}
              title={t(`coreBeliefs.${belief.key}.title`)}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}
