import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { CrawlerContent } from './crawler-content';

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email?.endsWith('@tuturuuu.com')) {
    throw new Error('Unauthorized');
  }

  const sbAdmin = await createAdminClient();

  const { data: crawledUrl } = await sbAdmin
    .from('crawled_urls')
    .select('*')
    .eq('id', crawlerId)
    .maybeSingle();

  const { data: relatedUrls } = !crawledUrl
    ? { data: [] }
    : await sbAdmin
        .from('crawled_url_next_urls')
        .select('*')
        .eq('origin_id', crawledUrl.id)
        .order('created_at', { ascending: false });

  const { data: crawledRelatedUrls } = await sbAdmin
    .from('crawled_urls')
    .select('*')
    .in(
      'url',
      relatedUrls?.map((r) =>
        r.url.trim().endsWith('/') ? r.url.trim() : r.url.trim() + '/'
      ) || []
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">{crawledUrl?.url}</h1>
        </div>
      </div>

      <CrawlerContent
        crawledUrl={crawledUrl}
        relatedUrls={(relatedUrls || []).map((r) => ({
          ...r,
          url: r.url.trim().endsWith('/') ? r.url.trim() : r.url.trim() + '/',
        }))}
        crawledRelatedUrls={(crawledRelatedUrls || []).map((r) => ({
          ...r,
          url: r.url.trim().endsWith('/') ? r.url.trim() : r.url.trim() + '/',
        }))}
        wsId={wsId}
        url={crawledUrl?.url || ''}
      />
    </div>
  );
}
