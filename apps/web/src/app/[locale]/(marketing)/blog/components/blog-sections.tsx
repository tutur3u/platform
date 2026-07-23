import {
  ArrowRight,
  BookText,
  FileText,
  GithubIcon,
  Mail,
  PenLine,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import {
  Reveal,
  RevealGroup,
  RevealItem,
} from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import { SurfaceCard } from '@/components/landing/shared/surface-card';
import { ActionLink } from '@/components/marketing/action-link';
import { PageHero } from '@/components/marketing/page-hero';
import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';
import { categories, plannedPosts } from './blog-data';

const repoUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

export function BlogHero() {
  return (
    <PageHero
      accent="purple"
      actions={
        <>
          <ActionLink href="/changelog">
            Read the changelog
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ActionLink>
          <ActionLink external href={repoUrl} variant="ghost">
            <GithubIcon className="h-4 w-4" />
            Follow the work
          </ActionLink>
        </>
      }
      description="We have not published anything yet. Rather than fake a launch, here is what is in the queue and where the writing already happens in the meantime."
      eyebrow="Blog"
      eyebrowIcon={BookText}
      highlight="not yet"
      title="Coming,"
    />
  );
}

export function BlogCategories() {
  return (
    <SectionShell
      bloom="purple"
      eyebrow="What we will write about"
      index="01"
      subtitle="Six threads we keep pulling on. Whatever gets published will sit under one of them."
      title="The beats"
      width="wide"
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.05}
      >
        {categories.map((category) => (
          <RevealItem className="h-full" key={category.name}>
            <SurfaceCard
              accent={category.accent}
              description={category.description}
              icon={category.icon}
              title={category.name}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}

export function PlannedPosts() {
  return (
    <SectionShell
      bloom="blue"
      eyebrow="In the queue"
      index="02"
      subtitle="Drafts, notes and arguments we owe you. No dates, because we would miss them."
      title="What is being written"
    >
      <Reveal>
        <Panel className="divide-y divide-foreground/[0.07]">
          {plannedPosts.map((post, index) => (
            <article
              className="group flex items-start gap-4 px-5 py-5 transition-colors duration-300 hover:bg-foreground/[0.02] sm:px-7 sm:py-6"
              key={post.title}
            >
              <span className="mt-1 w-6 shrink-0 font-mono-ui text-[0.62rem] text-foreground/25 tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>

              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.03]'
                )}
              >
                <post.icon className="h-3.5 w-3.5 text-foreground/55" />
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="text-balance font-display font-semibold text-[1.05rem] leading-snug tracking-[-0.01em]">
                  {post.title}
                </h3>
                <span className="mt-1.5 block font-mono-ui text-[0.58rem] text-foreground/35 uppercase tracking-[0.14em]">
                  {post.category}
                </span>
              </div>

              <span className="mt-1 shrink-0 rounded-full border border-foreground/[0.08] px-2 py-0.5 font-mono-ui text-[0.55rem] text-foreground/30 uppercase tracking-[0.14em]">
                Draft
              </span>
            </article>
          ))}
        </Panel>
      </Reveal>
    </SectionShell>
  );
}

/**
 * Where the writing already exists.
 *
 * The page this replaces ended on an email capture that was pure markup — an
 * unwired `<input>` and a `<Button>` with no handler — under a promise to let
 * you unsubscribe from a list that does not exist. These three all go
 * somewhere real.
 */
const channels = [
  {
    href: '/changelog',
    icon: FileText,
    title: 'Changelog',
    description:
      'What shipped, release by release. Updated far more often than any blog.',
    accent: 'blue' as const,
  },
  {
    href: repoUrl,
    icon: GithubIcon,
    title: 'The repository',
    description:
      'The whole platform is open source, so the commits are the real running commentary.',
    accent: 'purple' as const,
    external: true,
  },
  {
    href: '/contact',
    icon: PenLine,
    title: 'Write for us',
    description:
      'Got something worth publishing here? Pitch it and we will read it properly.',
    accent: 'green' as const,
  },
];

export function BlogChannels() {
  return (
    <SectionShell
      bloom="green"
      eyebrow="In the meantime"
      index="03"
      subtitle="Three places the work is already visible, none of which require an email address."
      title="Where to follow along"
    >
      <RevealGroup className="grid gap-3 sm:grid-cols-3" stagger={0.08}>
        {channels.map((channel) => (
          <RevealItem className="h-full" key={channel.title}>
            <SurfaceCard
              accent={channel.accent}
              description={channel.description}
              external={channel.external}
              href={channel.href}
              icon={channel.icon}
              size="lg"
              title={channel.title}
            />
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal delay={0.1}>
        <div className="mt-8 flex justify-center">
          <ActionLink href="/contact" variant="ghost">
            <Mail className="h-4 w-4" />
            Ask us to ping you at launch
          </ActionLink>
        </div>
      </Reveal>
    </SectionShell>
  );
}
