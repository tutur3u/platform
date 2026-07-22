'use client';

import dynamic from 'next/dynamic';
import { type ReactNode, useEffect, useRef, useState } from 'react';

function SectionFallback() {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
      <div className="mx-auto h-64 max-w-6xl animate-pulse rounded-2xl bg-foreground/[0.03]" />
    </section>
  );
}

function LazyLandingSection({
  children,
  rootMargin = '900px 0px',
}: {
  children: ReactNode;
  rootMargin?: string;
}) {
  const [shouldRender, setShouldRender] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shouldRender) return;

    const node = ref.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldRender(true);
        observer.disconnect();
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  return <div ref={ref}>{shouldRender ? children : <SectionFallback />}</div>;
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
      <LazyLandingSection rootMargin="1200px 0px">
        <ProblemSection />
      </LazyLandingSection>
      <LazyLandingSection rootMargin="1200px 0px">
        <OutcomesSection />
      </LazyLandingSection>
    </>
  );
}

/** Everything below the product bento. */
export function DeferredLandingSections() {
  return (
    <>
      <LazyLandingSection>
        <DemoSection />
      </LazyLandingSection>
      <LazyLandingSection>
        <AISection />
      </LazyLandingSection>
      <LazyLandingSection>
        <GithubStats />
      </LazyLandingSection>
      <LazyLandingSection>
        <PricingSection />
      </LazyLandingSection>
      <LazyLandingSection>
        <CTASection />
      </LazyLandingSection>
    </>
  );
}
