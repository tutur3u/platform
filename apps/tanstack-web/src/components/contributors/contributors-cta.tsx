import {
  Code,
  FileText,
  GitBranch,
  GithubIcon,
  Mail,
  MessageSquare,
  Zap,
} from '@tuturuuu/icons/lucide';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { repositoryForkUrl, repositoryUrl } from './github';

const contributionWays = [
  {
    description: 'Contribute new features or fix bugs through pull requests.',
    icon: Code,
    title: 'Submit Code',
  },
  {
    description: 'Help us by reporting bugs or suggesting improvements.',
    icon: MessageSquare,
    title: 'Report Issues',
  },
  {
    description: 'Enhance our documentation to help other users.',
    icon: FileText,
    title: 'Improve Docs',
  },
] as const;

export function ContributorsCta() {
  return (
    <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Card className="relative overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12">
          <div className="relative text-center">
            <Badge
              className="mb-4 border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
              variant="secondary"
            >
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Join Our Community
            </Badge>
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Become a Contributor
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed">
              Help us build the future of Tuturuuu. Whether you're a developer,
              designer, or documentation expert, there's a place for you in our
              community.
            </p>

            <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="lg">
                <a href={repositoryUrl} rel="noreferrer" target="_blank">
                  <GithubIcon className="mr-2 h-5 w-5" />
                  View on GitHub
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={repositoryForkUrl} rel="noreferrer" target="_blank">
                  <GitBranch className="mr-2 h-5 w-5" />
                  Fork Repository
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="mailto:contributors@tuturuuu.com">
                  <Mail className="mr-2 h-5 w-5" />
                  Contact Us
                </a>
              </Button>
            </div>

            <Separator className="my-8 bg-foreground/10" />

            <div className="grid gap-8 pt-2 sm:grid-cols-3">
              {contributionWays.map((way) => {
                const Icon = way.icon;

                return (
                  <div
                    className="group/item space-y-2 rounded-xl p-4 text-left transition-colors hover:bg-foreground/5"
                    key={way.title}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 group-hover/item:bg-foreground/20">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">{way.title}</h3>
                    <p className="text-foreground/60 text-sm">
                      {way.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="mt-8 text-foreground/60 text-sm">
              By contributing to Tuturuuu, you agree to our{' '}
              <a
                className="text-primary underline underline-offset-4 hover:text-primary/80"
                href={`${repositoryUrl}/blob/main/CODE_OF_CONDUCT.md`}
                rel="noopener noreferrer"
                target="_blank"
              >
                Code of Conduct
              </a>{' '}
              and{' '}
              <a
                className="text-primary underline underline-offset-4 hover:text-primary/80"
                href={`${repositoryUrl}/blob/main/CONTRIBUTING.md`}
                rel="noopener noreferrer"
                target="_blank"
              >
                Contributing Guidelines
              </a>
              .
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}
