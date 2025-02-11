import { CrawlerContent } from './crawler-content';
import { createClient } from '@tutur3u/supabase/next/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    crawlerId: string;
  }>;
}

export default async function DatasetDetailsPage({ params }: Props) {
  const { wsId, crawlerId } = await params;
  const supabase = await createClient();

  const { data: crawler } = await supabase
    .from('workspace_crawlers')
    .select('*')
    .eq('id', crawlerId)
    .single();

  if (!crawler) notFound();

  const { data: crawledUrl } = await supabase
    .from('crawled_urls')
    .select('*')
    .eq('url', crawler.url)
    .maybeSingle();

  const { data: relatedUrls } = !crawledUrl
    ? { data: [] }
    : await supabase
        .from('crawled_url_next_urls')
        .select('*')
        .eq('origin_id', crawledUrl.id)
        .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{crawler.url}</h1>
        </div>
      </div>

      <CrawlerContent
        initialCrawledUrl={crawledUrl}
        initialRelatedUrls={relatedUrls || []}
        wsId={wsId}
        url={crawler.url}
      />
    </div>
  );
}
