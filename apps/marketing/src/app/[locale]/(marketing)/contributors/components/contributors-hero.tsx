import {
  ArrowRight,
  GitFork,
  GithubIcon,
  Heart,
  Star,
  Users,
} from '@tuturuuu/icons/lucide';
import { Reveal } from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import { ActionLink } from '@/components/marketing/action-link';
import { PageHero } from '@/components/marketing/page-hero';
import { StatStrip } from '@/components/marketing/stat-strip';
import { type RepoSnapshot, repoUrl } from './github-data';

export function ContributorsHero({ snapshot }: { snapshot: RepoSnapshot }) {
  return (
    <PageHero
      accent="purple"
      actions={
        <>
          <ActionLink external href={repoUrl}>
            <GithubIcon className="h-4 w-4" />
            Open the repository
          </ActionLink>
          <ActionLink
            external
            href={`${repoUrl}/blob/main/CONTRIBUTING.md`}
            variant="ghost"
          >
            How to contribute
          </ActionLink>
        </>
      }
      description="The platform is open source. Every name here comes straight from the repository, ranked by commits, with no editorial hand on the list."
      eyebrow="Contributors"
      eyebrowIcon={Users}
      highlight="in the open"
      title="Built"
    >
      {snapshot.ok ? (
        <StatStrip
          stats={[
            {
              value: snapshot.contributors.length.toLocaleString(),
              label: 'Contributors',
              tone: 'purple',
            },
            {
              value: snapshot.stars.toLocaleString(),
              label: 'Stars',
              tone: 'yellow',
            },
            {
              value: snapshot.forks.toLocaleString(),
              label: 'Forks',
              tone: 'blue',
            },
            {
              value: snapshot.issues.toLocaleString(),
              label: 'Open issues',
              tone: 'green',
            },
          ]}
        />
      ) : null}
    </PageHero>
  );
}

const ways = [
  {
    icon: GithubIcon,
    title: 'Send a pull request',
    body: 'Pick up an open issue, or fix the thing that annoyed you. Small patches are welcome.',
    tone: 'text-dynamic-purple',
  },
  {
    icon: Star,
    title: 'Report what breaks',
    body: 'A precise bug report is worth more than a vague feature request.',
    tone: 'text-dynamic-yellow',
  },
  {
    icon: GitFork,
    title: 'Fork it',
    body: 'Take the parts you need. That is what open source is for.',
    tone: 'text-dynamic-blue',
  },
];

export function ContributorsClosing() {
  return (
    <SectionShell
      bloom="green"
      eyebrow="Join in"
      index="04"
      subtitle="No contributor licence gymnastics, no committee. Open a pull request."
      title="Add your name"
    >
      <Reveal>
        <Panel className="px-6 py-10 sm:px-10 sm:py-12">
          <div className="grid gap-8 sm:grid-cols-3">
            {ways.map((way) => (
              <div key={way.title}>
                <way.icon className={`h-5 w-5 ${way.tone}`} />
                <h3 className="mt-4 font-display font-semibold text-lg tracking-[-0.01em]">
                  {way.title}
                </h3>
                <p className="mt-2 text-foreground/50 text-sm leading-relaxed">
                  {way.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center gap-4 border-foreground/[0.07] border-t pt-8 sm:flex-row sm:justify-between">
            <p className="flex items-center gap-2 text-foreground/45 text-sm">
              <Heart className="h-4 w-4 text-dynamic-red/70" />
              Thank you to everyone who has sent a patch.
            </p>
            <ActionLink external href={`${repoUrl}/issues`}>
              Browse open issues
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ActionLink>
          </div>
        </Panel>
      </Reveal>
    </SectionShell>
  );
}
