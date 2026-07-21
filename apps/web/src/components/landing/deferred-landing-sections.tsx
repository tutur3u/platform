'use client';

import dynamic from 'next/dynamic';

function SectionFallback() {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
      <div className="mx-auto h-64 max-w-6xl animate-pulse rounded-2xl bg-foreground/[0.03]" />
    </section>
  );
}

const ProblemSection = dynamic(
  () =>
    import('@/components/landing/problem/problem-section').then(
      (module) => module.ProblemSection
    ),
  { loading: SectionFallback, ssr: false }
);

const OutcomesSection = dynamic(
  () =>
    import('@/components/landing/outcomes/outcomes-section').then(
      (module) => module.OutcomesSection
    ),
  { loading: SectionFallback, ssr: false }
);

const DemoSection = dynamic(
  () =>
    import('@/components/landing/demo/demo-section').then(
      (module) => module.DemoSection
    ),
  { loading: SectionFallback, ssr: false }
);

const PricingSection = dynamic(
  () =>
    import('@/components/landing/pricing/pricing-section').then(
      (module) => module.PricingSection
    ),
  { loading: SectionFallback, ssr: false }
);

const AISection = dynamic(
  () =>
    import('@/components/landing/ai/ai-section').then(
      (module) => module.AISection
    ),
  { loading: SectionFallback, ssr: false }
);

const GithubStats = dynamic(
  () =>
    import('@/components/landing/social-proof/github-stats').then(
      (module) => module.GithubStats
    ),
  { loading: SectionFallback, ssr: false }
);

const CTASection = dynamic(
  () =>
    import('@/components/landing/cta/cta-section').then(
      (module) => module.CTASection
    ),
  { loading: SectionFallback, ssr: false }
);

/**
 * Renders between the hero and the product bento: names the pain, then the
 * payoff, before the page shows the product that delivers it.
 */
export function DeferredProblemSection() {
  return (
    <>
      <ProblemSection />
      <OutcomesSection />
    </>
  );
}

/** Everything below the product bento. */
export function DeferredLandingSections() {
  return (
    <>
      <DemoSection />
      <AISection />
      <GithubStats />
      <PricingSection />
      <CTASection />
    </>
  );
}
