import {
  AlertTriangle,
  ArrowRight,
  Bug,
  ExternalLink,
  Megaphone,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Changelog',
  description: "See what's new in Tuturuuu.",
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string;
  version: string | null;
  published_at: string;
}

const categoryConfig: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    colorClass: string;
  }
> = {
  feature: {
    label: 'New Feature',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    colorClass:
      'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  },
  improvement: {
    label: 'Improvement',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    colorClass: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
  },
  bugfix: {
    label: 'Bug Fix',
    icon: <Bug className="h-3.5 w-3.5" />,
    colorClass:
      'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  },
  breaking: {
    label: 'Breaking Change',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    colorClass: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  },
  security: {
    label: 'Security',
    icon: <Shield className="h-3.5 w-3.5" />,
    colorClass:
      'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
  },
  performance: {
    label: 'Performance',
    icon: <Zap className="h-3.5 w-3.5" />,
    colorClass: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/20',
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function DashboardChangelogPage({ params }: Props) {
  await params; // Await params for Next.js dynamic route handling
  const changelogs = await getChangelogs();

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-purple/10">
            <Megaphone className="h-5 w-5 text-dynamic-purple" />
          </div>
          <div>
            <h1 className="font-bold text-2xl">What's New</h1>
            <p className="text-foreground/80">
              Stay up to date with the latest updates to Tuturuuu.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/changelog" target="_blank">
              <ExternalLink className="mr-2 h-4 w-4" />
              View Full Changelog
            </Link>
          </Button>
        </div>
      </div>

      <Separator className="my-4" />

      {changelogs.length === 0 ? (
        <Card className="p-8 text-center">
          <Megaphone className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="mb-2 font-semibold text-lg">No updates yet</h2>
          <p className="text-muted-foreground">
            We're working on exciting new features. Check back soon!
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {changelogs.map((entry) => {
            const config = categoryConfig[entry.category] || {
              label: entry.category,
              icon: null,
              colorClass: 'bg-muted text-muted-foreground',
            };

            return (
              <Link
                key={entry.id}
                href={`/changelog/${entry.slug}`}
                target="_blank"
                className="block"
              >
                <Card className="group p-4 transition-all hover:border-dynamic-purple/30 hover:shadow-md">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`gap-1 text-xs ${config.colorClass}`}
                        >
                          {config.icon}
                          {config.label}
                        </Badge>
                        {entry.version && (
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            v{entry.version}
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-xs">
                          {formatDate(entry.published_at)}
                        </span>
                      </div>

                      <h3 className="font-medium group-hover:text-dynamic-purple">
                        {entry.title}
                      </h3>

                      {entry.summary && (
                        <p className="mt-1 line-clamp-1 text-foreground/60 text-sm">
                          {entry.summary}
                        </p>
                      )}
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-dynamic-purple" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

async function getChangelogs(): Promise<ChangelogEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('changelog_entries')
    .select('id, title, slug, summary, category, version, published_at')
    .eq('is_published', true)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching changelogs:', error);
    return [];
  }

  // Filter ensures published_at is non-null; cast for TypeScript
  return (data || []).filter(
    (entry): entry is ChangelogEntry => entry.published_at !== null
  );
}
