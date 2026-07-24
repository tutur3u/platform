import {
  ArrowRight,
  GitBranch,
  GitFork,
  GithubIcon,
  GitPullRequest,
  Heart,
  Star,
  Users,
} from '@tuturuuu/icons/lucide';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';
import { repositoryForkUrl, repositoryUrl } from './github';
import type { RepoStats } from './types';

export function ContributorsHero({ stats }: { stats?: RepoStats }) {
  return (
    <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <Badge
            className="mb-6 border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink transition-all hover:scale-105 hover:bg-dynamic-pink/20 hover:shadow-dynamic-pink/20 hover:shadow-lg"
            variant="secondary"
          >
            <Heart className="mr-1.5 h-3.5 w-3.5" />
            Open Source Heroes
          </Badge>

          <h1 className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
            Built{' '}
            <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
              in the open
            </span>
          </h1>

          <p className="mx-auto mb-8 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl">
            Celebrating the incredible individuals who make{' '}
            <strong className="text-foreground">Tuturuuu</strong> better every
            day through open source contributions, code reviews, and community
            engagement.
          </p>

          <div className="mb-12 flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button
              asChild
              className="group w-full shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:w-auto"
              size="lg"
            >
              <a href={repositoryUrl} rel="noreferrer" target="_blank">
                <GithubIcon className="mr-2 h-5 w-5" />
                View Repository
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
            <Button
              asChild
              className="w-full transition-all hover:scale-105 sm:w-auto"
              size="lg"
              variant="outline"
            >
              <a href={repositoryForkUrl} rel="noreferrer" target="_blank">
                <GitBranch className="mr-2 h-5 w-5" />
                Fork Project
              </a>
            </Button>
            <Button
              asChild
              className="w-full transition-all hover:scale-105 sm:w-auto"
              size="lg"
              variant="outline"
            >
              <a href="/careers">
                <Users className="mr-2 h-5 w-5" />
                Join Our Team
              </a>
            </Button>
          </div>

          {stats ? (
            <div className="flex flex-col flex-wrap items-center justify-center gap-4 text-foreground/60 text-sm sm:flex-row sm:gap-6">
              <HeroStat
                icon={<Star className="h-4 w-4 text-dynamic-amber" />}
                label="Stars"
                value={stats.stars}
              />
              <HeroStat
                icon={<GitFork className="h-4 w-4 text-dynamic-blue" />}
                label="Forks"
                value={stats.forks}
              />
              <HeroStat
                icon={<Users className="h-4 w-4 text-dynamic-purple" />}
                label="Contributors"
                value={stats.contributors}
              />
              <HeroStat
                icon={<GitPullRequest className="h-4 w-4 text-dynamic-green" />}
                label="Pull Requests"
                value={stats.pullRequests}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
      {icon}
      {value.toLocaleString()} {label}
    </div>
  );
}
