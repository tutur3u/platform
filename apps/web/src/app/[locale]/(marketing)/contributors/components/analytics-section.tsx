'use client';

import dynamic from 'next/dynamic';
import { SectionShell } from '@/components/landing/shared/section-shell';
import type { GithubContributor } from './github-data';

/**
 * Recharts is heavy and only ever renders below the fold, so it stays behind a
 * dynamic import and out of the initial route graph.
 */
const ContributionAnalytics = dynamic(
  () =>
    import('../contribution-analytics').then(
      (module) => module.ContributionAnalytics
    ),
  {
    loading: () => (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-[26rem] animate-pulse rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]" />
        <div className="h-[26rem] animate-pulse rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]" />
      </div>
    ),
    ssr: false,
  }
);

export function AnalyticsSection({
  contributors,
}: {
  contributors: GithubContributor[];
}) {
  if (contributors.length === 0) return null;

  return (
    <SectionShell
      bloom="blue"
      eyebrow="Distribution"
      index="03"
      subtitle="Both charts are drawn from the commit counts GitHub reports. Nothing here is estimated."
      title="How the work is spread"
    >
      <ContributionAnalytics
        contributors={contributors.map((contributor) => ({
          login: contributor.login,
          contributions: contributor.contributions,
        }))}
      />
    </SectionShell>
  );
}
