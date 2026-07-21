import { Rocket, Target } from '@tuturuuu/icons/lucide';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { SurfaceCard } from '@/components/landing/shared/surface-card';
import { useAboutTranslations } from './use-about-translations';

/**
 * Mission and vision, stated once and side by side. The anchor is `#vision`
 * because the hero's primary action points here.
 */
export function PurposeSection() {
  const t = useAboutTranslations();

  return (
    <SectionShell
      bloom="purple"
      eyebrow={t('sections.purpose.eyebrow')}
      id="vision"
      index="01"
      subtitle={t('vision.subtitle')}
      title={`${t('vision.title.part1')} ${t('vision.title.highlight')}`}
    >
      <RevealGroup className="grid gap-3 md:grid-cols-2" stagger={0.08}>
        <RevealItem className="h-full">
          <SurfaceCard
            accent="purple"
            description={t('vision.mission.description')}
            icon={Target}
            size="lg"
            title={t('vision.mission.title')}
          />
        </RevealItem>
        <RevealItem className="h-full">
          <SurfaceCard
            accent="blue"
            description={t('vision.vision.description')}
            icon={Rocket}
            size="lg"
            title={t('vision.vision.title')}
          />
        </RevealItem>
      </RevealGroup>
    </SectionShell>
  );
}
