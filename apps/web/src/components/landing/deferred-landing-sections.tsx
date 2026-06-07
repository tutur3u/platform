'use client';

import dynamic from 'next/dynamic';

function SectionFallback() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto h-64 max-w-6xl animate-pulse rounded-lg bg-foreground/[0.03]" />
    </section>
  );
}

const DemoSection = dynamic(
  () =>
    import('@/components/landing/demo/demo-section').then(
      (module) => module.DemoSection
    ),
  { loading: SectionFallback }
);

const PricingSection = dynamic(
  () =>
    import('@/components/landing/pricing/pricing-section').then(
      (module) => module.PricingSection
    ),
  { loading: SectionFallback }
);

const AISection = dynamic(
  () =>
    import('@/components/landing/ai/ai-section').then(
      (module) => module.AISection
    ),
  { loading: SectionFallback }
);

const GithubStats = dynamic(
  () =>
    import('@/components/landing/social-proof/github-stats').then(
      (module) => module.GithubStats
    ),
  { loading: SectionFallback }
);

const CTASection = dynamic(
  () =>
    import('@/components/landing/cta/cta-section').then(
      (module) => module.CTASection
    ),
  { loading: SectionFallback }
);

export function DeferredLandingSections() {
  return (
    <>
      <DemoSection />
      <PricingSection />
      <AISection />
      <GithubStats />
      <CTASection />
    </>
  );
}
