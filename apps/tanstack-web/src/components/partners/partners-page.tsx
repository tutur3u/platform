import { FeaturedPartnersSection } from './featured-partners-section';
import { PartnersCtaSection } from './partners-cta-section';
import {
  DecorativeConnector,
  DecorativeFloatingIcons,
  PartnersEffects,
} from './partners-effects';
import { PartnersGridSection } from './partners-grid-section';
import { PartnersHero } from './partners-hero';

export function PartnersPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <PartnersEffects />
      <div className="relative z-10">
        <PartnersHero />
        <DecorativeFloatingIcons />
        <FeaturedPartnersSection />
        <DecorativeConnector />
        <PartnersGridSection />
        <PartnersCtaSection />
      </div>
    </main>
  );
}
