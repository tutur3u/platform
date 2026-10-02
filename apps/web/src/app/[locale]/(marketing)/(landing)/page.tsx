import { getTranslations } from 'next-intl/server';
import {
  DeferredLandingSections,
  DeferredProblemSection,
  HashScroll,
} from '@/components/landing/deferred-landing-sections';
import { FeaturesBento } from '@/components/landing/features/features-bento';
import { HeroSection } from '@/components/landing/hero/hero-section';
import { ProductMarquee } from '@/components/landing/shared/product-marquee';
import { TeamFaq } from '@/components/landing/team-faq';
import {
  createHomepageStructuredData,
  serializeStructuredData,
} from '@/lib/seo/structured-data';

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'marketingSeo.home',
  });
  const structuredData = createHomepageStructuredData({
    locale: normalizedLocale,
    title: t('title'),
    description: t('description'),
  });
  return (
    // The marketing layout reserves navbar height for inner pages; the landing
    // hero renders under the transparent navbar instead, so cancel that padding.
    <main className="relative mx-auto -mt-20 w-full overflow-x-hidden">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is serialized with HTML script terminators escaped.
        dangerouslySetInnerHTML={{
          __html: serializeStructuredData(structuredData),
        }}
      />
      {/* Page vignette — keeps the edges of the canvas darker than the centre
          so section blooms read as light sources rather than flat fills. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(ellipse_100%_60%_at_50%_0%,transparent,color-mix(in_oklab,var(--foreground)_4%,transparent))]"
      />

      {/* Deep links (`/#pricing`, `/pricing`) scroll to their section once the
          deferred sections below have mounted. */}
      <HashScroll />

      {/* Hero */}
      <HeroSection />

      {/* The whole suite, at a glance */}
      <ProductMarquee />

      {/* Problem framing, then the payoff */}
      <DeferredProblemSection />

      {/* Products */}
      <FeaturesBento />

      {/* Demo -> AI -> Social proof -> Pricing -> CTA */}
      <DeferredLandingSections />
      <TeamFaq />
    </main>
  );
}
