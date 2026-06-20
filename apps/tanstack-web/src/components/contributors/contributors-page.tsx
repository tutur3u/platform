import { useQuery } from '@tanstack/react-query';
import { GithubIcon, TrendingUp } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { ContributionAnalytics } from './contributors-analytics';
import { ContributorsCta } from './contributors-cta';
import { ContributorsEffects } from './contributors-effects';
import { ContributorsHero } from './contributors-hero';
import { ContributorsList } from './contributors-list';
import { SectionIntro } from './contributors-primitives';
import { ContributorsStats } from './contributors-stats';
import { contributorsQuery, repositoryUrl } from './github';

export function ContributorsPage() {
  const contributorsResult = useQuery(contributorsQuery);
  const githubData = contributorsResult.data;

  if (contributorsResult.isPending) {
    return (
      <main className="relative mx-auto w-full overflow-x-hidden text-balance">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <LoadingIndicator className="mx-auto mb-4 h-12 w-12" />
            <p className="text-foreground/60">Loading contributors data...</p>
          </div>
        </div>
      </main>
    );
  }

  if (contributorsResult.isError || githubData?.error) {
    return (
      <main className="relative mx-auto w-full overflow-x-hidden text-balance">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <GithubIcon className="mx-auto mb-4 h-16 w-16 text-foreground/40" />
            <h2 className="mb-2 font-bold text-2xl">Data Fetch Error</h2>
            <p className="mb-4 text-foreground/60">
              {githubData?.error ??
                'Failed to fetch GitHub data. Please try again later.'}
            </p>
            <Button asChild>
              <a href={repositoryUrl} rel="noopener noreferrer" target="_blank">
                <GithubIcon className="mr-2 h-4 w-4" />
                Visit GitHub Repository
              </a>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!githubData) {
    return null;
  }

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      <ContributorsEffects />
      <ContributorsHero stats={githubData.stats} />
      <ContributorsStats
        contributors={githubData.contributors}
        stats={githubData.stats}
      />
      <ContributorsList contributors={githubData.contributors} />
      {githubData.contributors.length > 0 ? (
        <section className="relative px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionIntro
              badge="Activity Dashboard"
              icon={TrendingUp}
              tone="cyan"
            >
              <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                Contribution{' '}
                <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                  Analytics
                </span>
              </h2>
              <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
                Visualizing the contribution patterns and activity across our
                platform
              </p>
            </SectionIntro>
            <ContributionAnalytics contributors={githubData.contributors} />
          </div>
        </section>
      ) : null}
      <ContributorsCta />
    </main>
  );
}
