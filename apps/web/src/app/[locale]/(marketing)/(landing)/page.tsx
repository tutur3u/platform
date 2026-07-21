import {
  DeferredLandingSections,
  DeferredProblemSection,
} from '@/components/landing/deferred-landing-sections';
import { FeaturesBento } from '@/components/landing/features/features-bento';
import { HeroSection } from '@/components/landing/hero/hero-section';
import { ProductMarquee } from '@/components/landing/shared/product-marquee';

export default function MarketingPage() {
  return (
    // The marketing layout reserves navbar height for inner pages; the landing
    // hero renders under the transparent navbar instead, so cancel that padding.
    <main className="relative mx-auto -mt-20 w-full overflow-x-hidden">
      {/* Page vignette — keeps the edges of the canvas darker than the centre
          so section blooms read as light sources rather than flat fills. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(ellipse_100%_60%_at_50%_0%,transparent,color-mix(in_oklab,var(--foreground)_4%,transparent))]"
      />

      {/* Hero */}
      <HeroSection />

      {/* The whole suite, at a glance */}
      <ProductMarquee />

      {/* Problem framing */}
      <DeferredProblemSection />

      {/* Products */}
      <FeaturesBento />

      {/* Demo -> AI -> Social proof -> Pricing -> CTA */}
      <DeferredLandingSections />
    </main>
  );
}
