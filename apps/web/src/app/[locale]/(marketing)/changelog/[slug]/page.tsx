import type { JSONContent } from '@tiptap/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bug,
  Calendar,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChangelogContentRenderer } from './content-renderer';

interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  content: JSONContent;
  summary: string | null;
  category: string;
  version: string | null;
  cover_image_url: string | null;
  published_at: string;
  created_at: string;
}

interface Props {
  params: Promise<{
    slug: string;
  }>;
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
    icon: <Sparkles className="h-4 w-4" />,
    colorClass:
      'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  },
  improvement: {
    label: 'Improvement',
    icon: <TrendingUp className="h-4 w-4" />,
    colorClass: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
  },
  bugfix: {
    label: 'Bug Fix',
    icon: <Bug className="h-4 w-4" />,
    colorClass:
      'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  },
  breaking: {
    label: 'Breaking Change',
    icon: <AlertTriangle className="h-4 w-4" />,
    colorClass: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  },
  security: {
    label: 'Security',
    icon: <Shield className="h-4 w-4" />,
    colorClass:
      'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
  },
  performance: {
    label: 'Performance',
    icon: <Zap className="h-4 w-4" />,
    colorClass: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/20',
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const changelog = await getChangelog(slug);

  if (!changelog) {
    return {
      title: 'Changelog Not Found | Tuturuuu',
    };
  }

  const title = `${changelog.title} | Changelog | Tuturuuu`;
  const description =
    changelog.summary || `Read about ${changelog.title} on Tuturuuu`;
  const categoryLabel =
    categoryConfig[changelog.category]?.label || changelog.category;

  return {
    title,
    description,
    keywords: [
      'changelog',
      'updates',
      'tuturuuu',
      categoryLabel.toLowerCase(),
      changelog.version ? `v${changelog.version}` : '',
    ].filter(Boolean),
    authors: [{ name: 'Tuturuuu Team' }],
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: changelog.published_at,
      modifiedTime: changelog.created_at,
      authors: ['Tuturuuu Team'],
      tags: [categoryLabel, 'changelog', 'update'],
      images: changelog.cover_image_url
        ? [
            {
              url: changelog.cover_image_url,
              width: 1200,
              height: 630,
              alt: changelog.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: changelog.cover_image_url
        ? [changelog.cover_image_url]
        : undefined,
    },
  };
}

export default async function ChangelogEntryPage({ params }: Props) {
  const { slug } = await params;
  const changelog = await getChangelog(slug);

  if (!changelog) {
    notFound();
  }

  const { previous, next } = await getAdjacentChangelogs(
    changelog.published_at
  );
  const config = categoryConfig[changelog.category] || {
    label: changelog.category,
    icon: null,
    colorClass: 'bg-muted text-muted-foreground',
  };

  return (
    <main className="relative mx-auto w-full overflow-x-hidden">
      {/* Background effects */}
      <div className="-z-10 pointer-events-none fixed inset-0">
        <div className="-left-32 absolute top-0 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/20 via-dynamic-pink/10 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]" />
        <div className="-right-32 absolute top-[30%] h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/20 via-dynamic-cyan/10 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]" />
      </div>

      <article className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Back Link */}
          <Link
            href="/changelog"
            className="mb-8 inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Changelog
          </Link>

          {/* Header */}
          <header className="mb-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`gap-1.5 ${config.colorClass}`}
              >
                {config.icon}
                {config.label}
              </Badge>
              {changelog.version && (
                <Badge variant="secondary" className="font-mono">
                  v{changelog.version}
                </Badge>
              )}
            </div>

            <h1 className="mb-4 text-balance font-bold text-3xl tracking-tight sm:text-4xl md:text-5xl">
              {changelog.title}
            </h1>

            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <time dateTime={changelog.published_at}>
                {formatDate(changelog.published_at)}
              </time>
            </div>
          </header>

          {/* Cover Image */}
          {changelog.cover_image_url && (
            <div className="mb-8 overflow-hidden rounded-lg">
              <img
                src={changelog.cover_image_url}
                alt={changelog.title}
                className="w-full object-cover"
              />
            </div>
          )}

          {/* Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <ChangelogContentRenderer content={changelog.content} />
          </div>

          {/* Navigation */}
          <nav className="mt-12 border-t pt-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
              {previous ? (
                <Link href={`/changelog/${previous.slug}`} className="group">
                  <Card className="p-4 transition-all hover:border-dynamic-purple/30 hover:shadow-md">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                      Previous
                    </div>
                    <div className="mt-1 font-medium group-hover:text-dynamic-purple">
                      {previous.title}
                    </div>
                  </Card>
                </Link>
              ) : (
                <div />
              )}

              {next ? (
                <Link
                  href={`/changelog/${next.slug}`}
                  className="group text-right"
                >
                  <Card className="p-4 transition-all hover:border-dynamic-purple/30 hover:shadow-md">
                    <div className="flex items-center justify-end gap-2 text-muted-foreground text-sm">
                      Next
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                    <div className="mt-1 font-medium group-hover:text-dynamic-purple">
                      {next.title}
                    </div>
                  </Card>
                </Link>
              ) : (
                <div />
              )}
            </div>
          </nav>

          {/* CTA */}
          <div className="mt-12">
            <Card className="border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-6 text-center">
              <h2 className="mb-2 font-semibold text-lg">
                Have feedback or suggestions?
              </h2>
              <p className="mb-4 text-muted-foreground">
                We'd love to hear from you! Open an issue or start a discussion
                on GitHub.
              </p>
              <Button variant="outline" asChild>
                <a
                  href="https://github.com/tutur3u/platform/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Start a Discussion
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </Card>
          </div>
        </div>
      </article>
    </main>
  );
}

async function getChangelog(slug: string): Promise<ChangelogEntry | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('changelog_entries')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .not('published_at', 'is', null)
    .single();

  if (error) {
    console.error('Error fetching changelog:', error);
    return null;
  }

  return data;
}

async function getAdjacentChangelogs(publishedAt: string): Promise<{
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
}> {
  const supabase = await createClient();

  // Get previous (older)
  const { data: prevData } = await supabase
    .from('changelog_entries')
    .select('slug, title')
    .eq('is_published', true)
    .not('published_at', 'is', null)
    .lt('published_at', publishedAt)
    .order('published_at', { ascending: false })
    .limit(1)
    .single();

  // Get next (newer)
  const { data: nextData } = await supabase
    .from('changelog_entries')
    .select('slug, title')
    .eq('is_published', true)
    .not('published_at', 'is', null)
    .gt('published_at', publishedAt)
    .order('published_at', { ascending: true })
    .limit(1)
    .single();

  return {
    previous: prevData || null,
    next: nextData || null,
  };
}
