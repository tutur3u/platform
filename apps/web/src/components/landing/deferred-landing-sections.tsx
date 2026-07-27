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

/** True when the current URL points at an on-page anchor (e.g. `#pricing`). */
function hasHashTarget() {
  return typeof window !== 'undefined' && window.location.hash.length > 1;
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

    // A deep link (`/#pricing`, or `/pricing` → `/?hash-nav=1#pricing`) needs
    // every section below the fold laid out at its true height; otherwise the
    // scroll lands where the anchor *would* be behind shrunken placeholders.
    // When the URL carries a hash we skip the lazy gate and render immediately.
    if (hasHashTarget()) {
      setShouldRender(true);
      return;
    }

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

/**
 * Scrolls to the URL's hash target on load and keeps it pinned while the
 * deferred sections above it mount and grow the page.
 *
 * The browser's native scroll-to-hash fires before those `ssr: false` sections
 * exist, so it finds nothing. This re-pins on every frame — with `instant` to
 * override the global `scroll-behavior: smooth` — until the target's position
 * settles or a manual scroll takes over.
 */
export function HashScroll() {
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '');
    if (!id) return;

    let frame = 0;
    let cancelled = false;
    let startTime = -1;
    let stableSince = -1;
    let lastTop = Number.NaN;

    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };

    function stop() {
      cancelled = true;
    }

    const tick = (now: number) => {
      if (cancelled) {
        cleanup();
        return;
      }
      if (startTime < 0) startTime = now;

      const el = document.getElementById(id);
      if (el) {
        const top = el.getBoundingClientRect().top;
        el.scrollIntoView({ block: 'start', behavior: 'instant' });

        if (Math.abs(top - lastTop) < 1) {
          if (stableSince < 0) stableSince = now;
        } else {
          stableSince = -1;
          lastTop = top;
        }
      }

      const settled = stableSince >= 0 && now - stableSince > 400;
      const timedOut = now - startTime > 2500;
      if (settled || timedOut) cleanup();
      else frame = requestAnimationFrame(tick);
    };

    // A manual scroll means the reader has taken over; stop fighting them.
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    frame = requestAnimationFrame(tick);

    return cleanup;
  }, []);

  return null;
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
