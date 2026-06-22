import { Calendar, GitCommit, Sparkles } from '@tuturuuu/icons/lucide';
import { Card } from '@tuturuuu/ui/card';
import { SectionIntro } from './contributors-primitives';
import type { GitHubContributor } from './types';

export function ContributorsList({
  contributors,
}: {
  contributors: GitHubContributor[];
}) {
  if (contributors.length === 0) {
    return null;
  }

  return (
    <section className="relative px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionIntro badge="Hall of Fame" icon={Sparkles} tone="purple">
          <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
            Top{' '}
            <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
              Contributors
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
            Recognizing the amazing developers who have contributed the most to
            our platform
          </p>
        </SectionIntro>

        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {contributors.slice(0, 20).map((contributor, index) => (
            <Card
              className="group h-full overflow-hidden border-primary/10 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md"
              key={contributor.id}
            >
              <a
                className="flex h-full flex-col p-6"
                href={contributor.html_url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="relative">
                    <div className="absolute -inset-0.5 rounded-full bg-linear-to-r from-primary to-dynamic-purple opacity-75 blur-sm group-hover:opacity-100" />
                    <div
                      aria-label={contributor.login}
                      className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-background bg-primary/10 font-bold text-primary text-xl"
                      role="img"
                    >
                      {getContributorInitials(contributor)}
                    </div>
                    {index < 3 ? (
                      <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-amber font-bold text-[10px] text-background">
                        #{index + 1}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center rounded-full bg-primary/10 px-3 py-1 font-medium text-xs">
                    <GitCommit className="mr-1 h-3 w-3" />
                    {contributor.contributions}
                  </div>
                </div>

                <div className="flex-1">
                  <h3 className="mb-1 line-clamp-1 font-semibold group-hover:text-primary">
                    {contributor.userDetails?.name || contributor.login}
                  </h3>
                  <p className="text-foreground/60 text-xs">
                    @{contributor.login}
                  </p>
                  {contributor.userDetails?.bio ? (
                    <p className="mt-2 line-clamp-3 text-foreground/70 text-xs">
                      {contributor.userDetails.bio}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center text-foreground/50 text-xs">
                  <Calendar className="mr-1 h-3.5 w-3.5" />
                  {contributor.userDetails?.created_at
                    ? `Joined ${new Date(
                        contributor.userDetails.created_at
                      ).toLocaleDateString('en', {
                        month: 'short',
                        year: 'numeric',
                      })}`
                    : 'GitHub Contributor'}
                </div>
              </a>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function getContributorInitials(contributor: GitHubContributor) {
  const displayName = contributor.userDetails?.name || contributor.login;
  const words = displayName
    .split(/[\s._-]+/u)
    .map((word) => word.trim())
    .filter(Boolean);

  return (words.length > 1 ? words : [displayName])
    .slice(0, 2)
    .map((word) => word.at(0)?.toUpperCase() ?? '')
    .join('');
}
