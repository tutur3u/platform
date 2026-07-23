import { ArrowUpRight, GitCommit } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import {
  Reveal,
  RevealGroup,
  RevealItem,
} from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import type { GithubContributor } from './github-data';

/** The three at the top get a wider card; everyone else gets a tile. */
const podiumTones = [
  'border-dynamic-yellow/30 bg-dynamic-yellow/[0.04]',
  'border-dynamic-blue/25 bg-dynamic-blue/[0.03]',
  'border-dynamic-orange/25 bg-dynamic-orange/[0.03]',
];

function Avatar({
  contributor,
  size,
}: {
  contributor: GithubContributor;
  size: 'lg' | 'md';
}) {
  return (
    // biome-ignore lint/performance/noImgElement: the marketing bundle is kept off next/image by the public shell compile graph.
    <img
      alt=""
      className={cn(
        'shrink-0 rounded-full border border-foreground/10 bg-foreground/5 object-cover transition-transform duration-500 group-hover:scale-105',
        size === 'lg' ? 'h-14 w-14' : 'h-9 w-9'
      )}
      loading="lazy"
      src={`${contributor.avatar_url}&s=128`}
    />
  );
}

export function ContributorGrid({
  contributors,
}: {
  contributors: GithubContributor[];
}) {
  if (contributors.length === 0) {
    return (
      <SectionShell
        bloom="purple"
        eyebrow="The people"
        index="02"
        subtitle="GitHub did not answer when this page was built. The roster lives in the repository in the meantime."
        title="Who built this"
      >
        <Reveal>
          <Panel className="px-6 py-12 text-center text-foreground/45 text-sm">
            Contributor list unavailable right now.
          </Panel>
        </Reveal>
      </SectionShell>
    );
  }

  const podium = contributors.slice(0, 3);
  const rest = contributors.slice(3);

  return (
    <SectionShell
      bloom="purple"
      eyebrow="The people"
      index="02"
      subtitle="Ranked by commits, straight from the repository. No curation, no ordering by seniority."
      title="Who built this"
      width="wide"
    >
      <RevealGroup className="mb-3 grid gap-3 sm:grid-cols-3" stagger={0.08}>
        {podium.map((contributor, index) => (
          <RevealItem className="h-full" key={contributor.id}>
            <a
              className={cn(
                'group relative flex h-full items-center gap-4 overflow-hidden rounded-2xl border p-5 transition-all duration-500',
                'hover:-translate-y-1 hover:shadow-2xl hover:shadow-foreground/5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                podiumTones[index]
              )}
              href={contributor.html_url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Avatar contributor={contributor} size="lg" />

              <div className="min-w-0 flex-1">
                <span className="font-mono-ui text-[0.55rem] text-foreground/35 tabular-nums tracking-[0.18em]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-0.5 flex items-center gap-1.5 truncate font-display font-semibold text-lg tracking-[-0.01em]">
                  <span className="truncate">{contributor.login}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-foreground/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/50" />
                </h3>
                <p className="mt-1 flex items-center gap-1.5 font-mono-ui text-[0.62rem] text-foreground/45 tabular-nums">
                  <GitCommit className="h-3 w-3" />
                  {contributor.contributions.toLocaleString()} commits
                </p>
              </div>
            </a>
          </RevealItem>
        ))}
      </RevealGroup>

      {rest.length > 0 ? (
        <Reveal delay={0.1}>
          <Panel className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {rest.map((contributor) => (
              <a
                className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-all duration-300 hover:border-foreground/10 hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={contributor.html_url}
                key={contributor.id}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Avatar contributor={contributor} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[0.9rem]">
                    {contributor.login}
                  </span>
                  <span className="block font-mono-ui text-[0.58rem] text-foreground/35 tabular-nums">
                    {contributor.contributions.toLocaleString()} commits
                  </span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-foreground/15 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/40" />
              </a>
            ))}
          </Panel>
        </Reveal>
      ) : null}
    </SectionShell>
  );
}
