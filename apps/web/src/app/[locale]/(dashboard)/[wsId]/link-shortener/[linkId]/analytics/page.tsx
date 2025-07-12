import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Calendar,
  Globe,
  MapPin,
  MousePointerClick,
  Share2,
  TrendingUp,
  Users,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AnalyticsHeader } from './analytics-header';

interface Props {
  params: Promise<{
    wsId: string;
    linkId: string;
  }>;
}

export default async function LinkAnalyticsPage({ params }: Props) {
  const { wsId, linkId } = await params;
  const t = await getTranslations();

  // Fetch analytics data
  const analyticsData = await fetchAnalyticsData(linkId);

  if (!analyticsData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <div className="container mx-auto space-y-8 px-4 py-8">
          <div className="text-center">
            <div className="relative mx-auto mb-6 h-24 w-24">
              <div className="absolute inset-0 rounded-full bg-dynamic-red/20 blur-xl" />
              <div className="relative rounded-full border border-dynamic-red/20 bg-gradient-to-br from-dynamic-red/10 to-dynamic-red/5 p-6">
                <Activity className="h-12 w-12 text-dynamic-red" />
              </div>
            </div>
            <h1 className="font-bold text-2xl text-dynamic-red">
              {t('link-shortener.analytics.not_found')}
            </h1>
            <p className="mb-6 text-dynamic-red/80">
              {t('link-shortener.analytics.not_found_desc')}
            </p>
            <Link href={`/${wsId}/link-shortener`}>
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('link-shortener.analytics.back_to_links')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { link, analytics, clicksByDay, topReferrers, topCountries } =
    analyticsData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto space-y-8 px-4 py-8">
        {/* Header Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Link href={`/${wsId}/link-shortener`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('link-shortener.analytics.back_to_links')}
              </Button>
            </Link>
          </div>

          <AnalyticsHeader link={link} />
        </div>

        {/* Analytics Stats Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-dynamic-blue/5 via-dynamic-blue/10 to-dynamic-blue/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-dynamic-blue/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <CardHeader className="relative pb-3">
              <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <div className="rounded-md bg-dynamic-blue/10 p-1.5 transition-colors group-hover:bg-dynamic-blue/20">
                  <MousePointerClick className="h-4 w-4 text-dynamic-blue" />
                </div>
                {t('link-shortener.analytics.total_clicks')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="mb-1 font-bold text-3xl text-dynamic-blue">
                {(analytics.total_clicks || 0).toLocaleString()}
              </div>
              <p className="text-muted-foreground text-xs">
                {t('link-shortener.analytics.all_time_clicks')}
              </p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-dynamic-green/5 via-dynamic-green/10 to-dynamic-green/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-dynamic-green/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <CardHeader className="relative pb-3">
              <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <div className="rounded-md bg-dynamic-green/10 p-1.5 transition-colors group-hover:bg-dynamic-green/20">
                  <Users className="h-4 w-4 text-dynamic-green" />
                </div>
                {t('link-shortener.analytics.unique_visitors')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="mb-1 font-bold text-3xl text-dynamic-green">
                {(analytics.unique_visitors || 0).toLocaleString()}
              </div>
              <p className="text-muted-foreground text-xs">
                {t('link-shortener.analytics.unique_ip_addresses')}
              </p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-dynamic-orange/5 via-dynamic-orange/10 to-dynamic-orange/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-dynamic-orange/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <CardHeader className="relative pb-3">
              <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <div className="rounded-md bg-dynamic-orange/10 p-1.5 transition-colors group-hover:bg-dynamic-orange/20">
                  <TrendingUp className="h-4 w-4 text-dynamic-orange" />
                </div>
                {t('link-shortener.analytics.unique_referrers')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="mb-1 font-bold text-3xl text-dynamic-orange">
                {(analytics.unique_referrers || 0).toLocaleString()}
              </div>
              <p className="text-muted-foreground text-xs">
                {t('link-shortener.analytics.traffic_sources')}
              </p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-dynamic-purple/5 via-dynamic-purple/10 to-dynamic-purple/5 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-dynamic-purple/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <CardHeader className="relative pb-3">
              <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <div className="rounded-md bg-dynamic-purple/10 p-1.5 transition-colors group-hover:bg-dynamic-purple/20">
                  <Globe className="h-4 w-4 text-dynamic-purple" />
                </div>
                {t('link-shortener.analytics.unique_countries')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="mb-1 font-bold text-3xl text-dynamic-purple">
                {(analytics.unique_countries || 0).toLocaleString()}
              </div>
              <p className="text-muted-foreground text-xs">
                {t('link-shortener.analytics.geographic_reach')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Data Section */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {/* Clicks by Day */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-3">
                <div className="rounded-lg bg-dynamic-blue/10 p-2">
                  <BarChart3 className="h-5 w-5 text-dynamic-blue" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {t('link-shortener.analytics.clicks_over_time')}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t('link-shortener.analytics.last_30_days_activity')}
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                {clicksByDay.length > 0 ? (
                  <div className="space-y-3">
                    {clicksByDay.slice(0, 10).map((day) => {
                      const maxClicks = Math.max(
                        ...clicksByDay.map((d) => d.clicks)
                      );
                      const percentage = (day.clicks / maxClicks) * 100;
                      return (
                        <div key={day.date} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm">
                              {day.date}
                            </span>
                            <span className="font-semibold text-dynamic-blue">
                              {day.clicks}{' '}
                              {t('link-shortener.analytics.clicks')}
                            </span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                    {clicksByDay.length > 10 && (
                      <p className="text-center text-muted-foreground text-sm">
                        {t('link-shortener.analytics.and_more_days', {
                          count: clicksByDay.length - 10,
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 text-center">
                    <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      {t('link-shortener.analytics.no_click_data')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Referrers */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-3">
                <div className="rounded-lg bg-dynamic-orange/10 p-2">
                  <TrendingUp className="h-5 w-5 text-dynamic-orange" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {t('link-shortener.analytics.top_referrers')}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t('link-shortener.analytics.traffic_sources')}
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                {topReferrers.length > 0 ? (
                  <div className="space-y-3">
                    {topReferrers.slice(0, 8).map((referrer, index) => {
                      const maxCount = Math.max(
                        ...topReferrers.map((r) => r.count)
                      );
                      const percentage = (referrer.count / maxCount) * 100;
                      return (
                        <div key={referrer.domain} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="h-5 w-5 rounded-full p-0 text-xs"
                              >
                                {index + 1}
                              </Badge>
                              <span className="truncate font-medium text-sm">
                                {referrer.domain}
                              </span>
                            </div>
                            <span className="font-semibold text-dynamic-orange">
                              {referrer.count}
                            </span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2 text-center">
                    <Share2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      {t('link-shortener.analytics.no_referrer_data')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Countries */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-3">
                <div className="rounded-lg bg-dynamic-green/10 p-2">
                  <MapPin className="h-5 w-5 text-dynamic-green" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {t('link-shortener.analytics.top_countries')}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t('link-shortener.analytics.geographic_distribution')}
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                {topCountries.length > 0 ? (
                  <div className="space-y-3">
                    {topCountries.slice(0, 8).map((country, index) => {
                      const maxCount = Math.max(
                        ...topCountries.map((c) => c.count)
                      );
                      const percentage = (country.count / maxCount) * 100;
                      return (
                        <div key={country.country} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="h-5 w-5 rounded-full p-0 text-xs"
                              >
                                {index + 1}
                              </Badge>
                              <span className="truncate font-medium text-sm">
                                {country.country}
                              </span>
                            </div>
                            <span className="font-semibold text-dynamic-green">
                              {country.count}
                            </span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2 text-center">
                    <Globe className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      {t('link-shortener.analytics.no_country_data')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional Info */}
        {analytics.first_click_at && (
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <CardContent className="relative p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <h4 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                    {t('link-shortener.analytics.first_click')}
                  </h4>
                  <p className="text-lg">
                    {new Date(analytics.first_click_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                    {t('link-shortener.analytics.last_click')}
                  </h4>
                  <p className="text-lg">
                    {analytics.last_click_at
                      ? new Date(analytics.last_click_at).toLocaleDateString()
                      : t('link-shortener.analytics.never')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

async function fetchAnalyticsData(linkId: string) {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return null;
    }

    // Get the link details
    const { data: link, error: linkError } = await sbAdmin
      .from('shortened_links')
      .select('*')
      .eq('id', linkId)
      .single();

    if (linkError || !link) {
      console.error('Link not found:', linkError);
      return null;
    }

    // Check if user has access to this workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('ws_id', link.ws_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!workspaceMember) {
      console.error('User does not have access to this workspace');
      return null;
    }

    // Get analytics summary
    const { data: analytics, error: analyticsError } = await sbAdmin
      .from('link_analytics_summary')
      .select('*')
      .eq('link_id', linkId)
      .single();

    if (analyticsError) {
      console.error('Analytics summary error:', analyticsError);
      return null;
    }

    // Get clicks by day (last 30 days)
    const { data: clicksByDay } = await sbAdmin
      .from('link_analytics')
      .select('clicked_at')
      .eq('link_id', linkId)
      .gte(
        'clicked_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order('clicked_at', { ascending: false });

    // Get top referrers
    const { data: topReferrers } = await sbAdmin
      .from('link_analytics')
      .select('referrer_domain')
      .eq('link_id', linkId)
      .not('referrer_domain', 'is', null);

    // Get top countries
    const { data: topCountries } = await sbAdmin
      .from('link_analytics')
      .select('country')
      .eq('link_id', linkId)
      .not('country', 'is', null);

    // Process clicks by day
    const clicksByDayProcessed = processClicksByDay(clicksByDay || []);

    // Process top referrers
    const topReferrersProcessed = processTopReferrers(topReferrers || []);

    // Process top countries
    const topCountriesProcessed = processTopCountries(topCountries || []);

    return {
      link,
      analytics: analytics || {
        total_clicks: 0,
        unique_visitors: 0,
        unique_referrers: 0,
        unique_countries: 0,
        first_click_at: null,
        last_click_at: null,
      },
      clicksByDay: clicksByDayProcessed,
      topReferrers: topReferrersProcessed,
      topCountries: topCountriesProcessed,
    };
  } catch (error) {
    console.error('Failed to fetch analytics data:', error);
    return null;
  }
}

function processClicksByDay(clicks: Array<{ clicked_at: string }>) {
  const dayCountMap = new Map<string, number>();

  clicks.forEach((click) => {
    const date = new Date(click.clicked_at).toISOString().split('T')[0];
    if (!date) return;
    dayCountMap.set(date, (dayCountMap.get(date) || 0) + 1);
  });

  return Array.from(dayCountMap.entries())
    .map(([date, clicks]) => ({ date, clicks }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function processTopReferrers(
  referrers: Array<{ referrer_domain: string | null }>
) {
  const referrerCountMap = new Map<string, number>();

  referrers.forEach((ref) => {
    const domain = ref.referrer_domain || 'Direct';
    referrerCountMap.set(domain, (referrerCountMap.get(domain) || 0) + 1);
  });

  return Array.from(referrerCountMap.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

function processTopCountries(countries: Array<{ country: string | null }>) {
  const countryCountMap = new Map<string, number>();

  countries.forEach((country) => {
    const countryName = country.country || 'Unknown';
    countryCountMap.set(
      countryName,
      (countryCountMap.get(countryName) || 0) + 1
    );
  });

  return Array.from(countryCountMap.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);
}
