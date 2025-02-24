import { createAdminClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

const SUPABASE_MAX_ROWS = 1000;

export async function GET() {
  try {
    const sbAdmin = await createAdminClient();
    const domains = new Set<string>();
    let allDomainsProcessed = false;
    let currentOffset = 0;

    // Get domains from crawled URLs
    while (!allDomainsProcessed) {
      const { data: batchUrls, error: batchError } = await sbAdmin
        .from('crawled_urls')
        .select('url')
        .range(currentOffset, currentOffset + SUPABASE_MAX_ROWS - 1);

      if (batchError) throw batchError;

      if (!batchUrls || batchUrls.length === 0) {
        break;
      }

      batchUrls.forEach((urlObj) => {
        try {
          const hostname = new URL(urlObj.url).hostname;
          if (hostname) domains.add(hostname);
        } catch {
          // Skip invalid URLs
        }
      });

      if (batchUrls.length < SUPABASE_MAX_ROWS) {
        allDomainsProcessed = true;
      } else {
        currentOffset += SUPABASE_MAX_ROWS;
      }
    }

    // Reset for next table
    allDomainsProcessed = false;
    currentOffset = 0;

    // Get domains from uncrawled URLs
    while (!allDomainsProcessed) {
      const { data: batchUrls, error: batchError } = await sbAdmin
        .from('crawled_url_next_urls')
        .select('url')
        .eq('skipped', false)
        .range(currentOffset, currentOffset + SUPABASE_MAX_ROWS - 1);

      if (batchError) throw batchError;

      if (!batchUrls || batchUrls.length === 0) {
        break;
      }

      batchUrls.forEach((urlObj) => {
        try {
          const hostname = new URL(urlObj.url).hostname;
          if (hostname) domains.add(hostname);
        } catch {
          // Skip invalid URLs
        }
      });

      if (batchUrls.length < SUPABASE_MAX_ROWS) {
        allDomainsProcessed = true;
      } else {
        currentOffset += SUPABASE_MAX_ROWS;
      }
    }

    const sortedDomains = Array.from(domains).sort();

    return NextResponse.json({
      domains: sortedDomains,
      cached: false,
    });
  } catch (error) {
    console.error('Error fetching domains:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
