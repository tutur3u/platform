import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    const { linkId } = await params;
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First, verify the user has access to this link
    const { data: shortenedLink, error: linkError } = await sbAdmin
      .from('shortened_links')
      .select('id, ws_id, slug, link, creator_id, created_at')
      .eq('id', linkId)
      .single();

    if (linkError || !shortenedLink) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    // Check if user is a member of the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('ws_id', shortenedLink.ws_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get analytics summary from the view
    const { data: summary, error: summaryError } = await sbAdmin
      .from('link_analytics_summary')
      .select('*')
      .eq('link_id', linkId)
      .single();

    if (summaryError) {
      // If no analytics data exists yet, return basic link info with zero stats
      return NextResponse.json({
        link: {
          id: shortenedLink.id,
          slug: shortenedLink.slug,
          original_url: shortenedLink.link,
          created_at: shortenedLink.created_at,
        },
        analytics: {
          total_clicks: 0,
          unique_visitors: 0,
          unique_referrers: 0,
          unique_countries: 0,
          first_click_at: null,
          last_click_at: null,
          top_referrer_domain: null,
          top_country: null,
        },
        clicksByDay: [],
        topReferrers: [],
        topCountries: [],
      });
    }

    // Get clicks by day for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: clicksByDay } = await sbAdmin
      .from('link_analytics')
      .select('clicked_at')
      .eq('link_id', linkId)
      .gte('clicked_at', thirtyDaysAgo.toISOString())
      .order('clicked_at', { ascending: true });

    // Process clicks by day
    const clicksData =
      clicksByDay?.reduce((acc: Record<string, number>, click) => {
        const date = new Date(click.clicked_at).toISOString().split('T')[0];
        if (!date) {
          return acc;
        }
        acc[date] = (acc[date] ?? 0) + 1;
        return acc;
      }, {}) || {};

    const clicksByDayArray = Object.entries(clicksData).map(
      ([date, count]) => ({
        date,
        clicks: count,
      })
    );

    // Get top referrers
    const { data: topReferrers } = await sbAdmin
      .from('link_analytics')
      .select('referrer_domain')
      .eq('link_id', linkId)
      .not('referrer_domain', 'is', null)
      .not('referrer_domain', 'eq', '');

    const referrerCounts =
      topReferrers?.reduce(
        (acc: Record<string, number>, item) => {
          if (item.referrer_domain) {
            acc[item.referrer_domain] = (acc[item.referrer_domain] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>
      ) || {};

    const topReferrersArray = Object.entries(referrerCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get top countries
    const { data: topCountries } = await sbAdmin
      .from('link_analytics')
      .select('country')
      .eq('link_id', linkId)
      .not('country', 'is', null)
      .not('country', 'eq', '');

    const countryCounts =
      topCountries?.reduce(
        (acc: Record<string, number>, item) => {
          if (item.country) {
            acc[item.country] = (acc[item.country] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>
      ) || {};

    const topCountriesArray = Object.entries(countryCounts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      link: {
        id: shortenedLink.id,
        slug: shortenedLink.slug,
        original_url: shortenedLink.link,
        created_at: shortenedLink.created_at,
      },
      analytics: {
        total_clicks: summary.total_clicks || 0,
        unique_visitors: summary.unique_visitors || 0,
        unique_referrers: summary.unique_referrers || 0,
        unique_countries: summary.unique_countries || 0,
        first_click_at: summary.first_click_at,
        last_click_at: summary.last_click_at,
        top_referrer_domain: summary.top_referrer_domain,
        top_country: summary.top_country,
      },
      clicksByDay: clicksByDayArray,
      topReferrers: topReferrersArray,
      topCountries: topCountriesArray,
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
