import type { Lang } from '@tuturuuu/roadmap-core/components/shared.tsx';
import en from '@tuturuuu/roadmap-core/messages/en.json';
import vi from '@tuturuuu/roadmap-core/messages/vi.json';
import { RoadmapPage } from '@tuturuuu/roadmap-core/pages/roadmap.tsx';
import { BUILD_TECH_STACK } from '@tuturuuu/roadmap-core/tech-stack.ts';
import type { loadActivity } from '../activity-loader';
import { ProductHeatmap, ReleaseTrain } from './pulse-activity';
import { buildPulseFallback } from './pulse-data';
import { PulseProducts } from './pulse-products';
import { PulseSummary } from './pulse-summary';
import { PulseTechStack } from './pulse-tech-stack';

const fallback = buildPulseFallback();

/**
 * The roadmap page with the Worker's observed activity: a compact summary
 * header, and in the Activity tab the product, heatmap and release charts
 * between the shipping pulse and the production updates; the tech stack
 * leads the Tech stack tab.
 */
export function PulseRoadmap({
  lang,
  observation,
  now,
}: {
  lang: Lang;
} & Awaited<ReturnType<typeof loadActivity>>) {
  const t = lang === 'en' ? en : vi;
  const scheduled = observation?.roadmap;
  const sampled = Boolean(
    scheduled && (!fallback || scheduled.generatedAt >= fallback.generatedAt)
  );
  const snapshot = sampled ? (scheduled ?? fallback) : fallback;
  return (
    <RoadmapPage
      lang={lang}
      observation={observation}
      renderHeader={(view) => (
        <PulseSummary
          t={t}
          lang={lang}
          view={view}
          snapshot={snapshot}
          sampled={sampled}
          now={now}
        />
      )}
      activityExtras={(view) => (
        <>
          <PulseProducts
            t={t}
            lang={lang}
            view={view}
            data={snapshot?.products ?? []}
          />
          <ProductHeatmap
            copy={t.pulseRoadmap}
            lang={lang}
            snapshot={snapshot}
          />
          <ReleaseTrain copy={t.pulseRoadmap} lang={lang} snapshot={snapshot} />
        </>
      )}
      stackLead={<PulseTechStack apps={BUILD_TECH_STACK} lang={lang} />}
    />
  );
}
