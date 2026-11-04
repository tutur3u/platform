import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { CrawlerContent } from './crawler-content';

export const metadata: Metadata = {
  title: 'Crawler Details',
  description:
    'Manage Crawler Details in the Crawlers area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    crawlerId: string;
  }>;
}

export default async function DatasetDetailsPage({ params }: Props) {
  await connection();

  const { wsId, crawlerId } = await params;
  const supabase = await createClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (
    !isVerifiedTuturuuuStaffSession(
      user &&
        (await getVerifiedAuthUser(
          await createAdminClient({ noCookie: true }),
          user.id
        ))
    )
  ) {
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
        r.url.trim().endsWith('/') ? r.url.trim() : `${r.url.trim()}/`
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
          url: r.url.trim().endsWith('/') ? r.url.trim() : `${r.url.trim()}/`,
        }))}
        crawledRelatedUrls={(crawledRelatedUrls || []).map((r) => ({
          ...r,
          url: r.url.trim().endsWith('/') ? r.url.trim() : `${r.url.trim()}/`,
        }))}
        wsId={wsId}
        url={crawledUrl?.url || ''}
      />
    </div>
  );
}
