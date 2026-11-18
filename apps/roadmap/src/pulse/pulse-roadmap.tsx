import { StoreReleases } from '@tuturuuu/roadmap-core/components/store-releases.tsx';
import type { Lang } from '@tuturuuu/roadmap-core/components/shared.tsx';
import en from '@tuturuuu/roadmap-core/messages/en.json';
import vi from '@tuturuuu/roadmap-core/messages/vi.json';
import { RoadmapPage } from '@tuturuuu/roadmap-core/pages/roadmap.tsx';
import type { loadActivity } from '../activity-loader';
import { ProductHeatmap, ReleaseTrain } from './pulse-activity';
import { buildPulseFallback } from './pulse-data';
import { PulseHero } from './pulse-hero';
import { PulseProducts } from './pulse-products';

const fallback = buildPulseFallback();

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
      renderLead={(view) => (
        <div className="pulse-layout-new">
          <PulseHero
            t={t}
            lang={lang}
            snapshot={snapshot}
            sampled={sampled}
            now={now}
          />
          <PulseProducts
            t={t}
            lang={lang}
            view={view}
            data={snapshot?.products ?? []}
          />
          <ReleaseTrain copy={t.pulseRoadmap} lang={lang} snapshot={snapshot} />
          <ProductHeatmap
            copy={t.pulseRoadmap}
            lang={lang}
            snapshot={snapshot}
          />
          <StoreReleases lang={lang} t={t.storeReleases} />
        </div>
      )}
    />
  );
}
