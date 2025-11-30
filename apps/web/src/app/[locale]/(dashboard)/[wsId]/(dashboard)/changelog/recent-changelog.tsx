import { ArrowRight, FileText, Newspaper, Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import ExpandableChangelogList from './expandable-changelog-list';

export default async function RecentChangelog({
  className,
}: {
  className?: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');

  const { data: entries, error } = await supabase
    .from('changelog_entries')
    .select('id, title, slug, summary, category, version, published_at')
    .eq('is_published', true)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(6);

  if (error) {
    console.error('Error fetching changelog entries:', error);
    return null;
  }

  return (
    <Card
      className={cn(
        'group overflow-hidden border-dynamic-blue/20 bg-linear-to-br from-card via-card to-dynamic-blue/5 shadow-lg ring-1 ring-dynamic-blue/10 transition-all duration-300 hover:border-dynamic-blue/30 hover:shadow-xl hover:ring-dynamic-blue/20',
        className
      )}
    >
      <CardHeader className="space-y-0 border-dynamic-blue/20 border-b bg-linear-to-r from-dynamic-blue/10 via-dynamic-blue/5 to-transparent p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 font-semibold text-base">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-xl bg-dynamic-blue/20 blur-lg" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-blue via-dynamic-blue/90 to-dynamic-cyan shadow-lg ring-2 ring-dynamic-blue/30">
                <Newspaper className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold">{t('recent_updates')}</span>
              <span className="font-medium text-dynamic-blue text-xs">
                {entries?.length || 0} {t('recent')}
              </span>
            </div>
          </CardTitle>
          <Link href="/changelog">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-dynamic-blue/30 bg-background/50 backdrop-blur-sm transition-all hover:border-dynamic-blue hover:bg-dynamic-blue/10 hover:text-dynamic-blue"
            >
              {t('view_all')}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {entries && entries.length > 0 ? (
          <ExpandableChangelogList entries={entries} />
        ) : (
          <div className="py-8 text-center">
            <div className="relative mx-auto mb-4 w-fit">
              <div className="absolute inset-0 animate-pulse rounded-full bg-dynamic-blue/20 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/10 via-dynamic-blue/5 to-transparent shadow-lg ring-4 ring-dynamic-blue/10">
                <FileText className="h-8 w-8 text-dynamic-blue/50" />
              </div>
            </div>
            <h3 className="font-semibold text-sm">{t('no_updates')}</h3>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('no_updates_description')}
            </p>
            <Link href="/changelog" className="mt-4 inline-block">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-dynamic-blue/30 transition-all hover:border-dynamic-blue hover:bg-dynamic-blue/10 hover:text-dynamic-blue"
              >
                <Plus className="h-4 w-4" />
                {t('view_changelog')}
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
