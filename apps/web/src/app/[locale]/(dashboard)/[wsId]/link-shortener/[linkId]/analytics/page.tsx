import { Activity, ArrowLeft, Clock } from '@tuturuuu/icons';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AnalyticsCards } from './analytics-cards';
import { AnalyticsHeader } from './analytics-header';
import { AnalyticsSummary } from './analytics-summary';
import { DailyActivityChart } from './daily-activity-chart';
import { DeviceAnalytics } from './device-analytics';
import { GeographicAnalytics } from './geographic-analytics';
import { HourlyChart } from './hourly-chart';
import { WeeklyActivity } from './weekly-activity';

export const metadata: Metadata = {
  title: 'Analytics',
  description: 'Manage Analytics in the Link area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    linkId: string;
  }>;
}

interface AnalyticsData {
  link: any;
  analytics: {
    total_clicks: number | null;
    unique_visitors: number | null;
    unique_referrers: number | null;
    unique_countries: number | null;
    first_click_at: string | null;
    last_click_at: string | null;
  };
  clicksByDay: Array<{ date: string; clicks: number }>;
  topReferrers: Array<{ domain: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  topCities: Array<{ city: string; country: string; count: number }>;
  deviceTypes: Array<{ device_type: string; count: number }>;
  browsers: Array<{ browser: string; count: number }>;
  operatingSystems: Array<{ os: string; count: number }>;
  clicksByHour: Array<{ hour: number; clicks: number }>;
  clicksByDayOfWeek: Array<{
    day_of_week: number | null;
    day_name: string | undefined;
    clicks: number | null;
  }>;
}

export default async function LinkAnalyticsPage({ params }: Props) {
  const { wsId, linkId } = await params;
  const t = await getTranslations();

  // Fetch analytics data
  const analyticsData = await fetchAnalyticsData(linkId);

  if (!analyticsData) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto space-y-8 px-4 py-8">
          <div className="text-center">
            <div className="relative mx-auto mb-6 h-24 w-24">
              <div className="absolute inset-0 rounded-full bg-dynamic-red/20 blur-xl" />
              <div className="relative rounded-full border border-dynamic-red/20 bg-linear-to-br from-dynamic-red/10 to-dynamic-red/5 p-6">
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

  const {
    link,
    analytics,
    clicksByDay,
    topReferrers,
    topCountries,
    topCities,
    deviceTypes,
    browsers,
    operatingSystems,
    clicksByHour,
    clicksByDayOfWeek,
  } = analyticsData;

  return (
    <div className="min-h-screen">
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

        {/* Main Analytics Stats Cards */}
        <AnalyticsCards analytics={analytics} />

        {/* Time-based Analytics */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Activity by Hour */}
          <Card className="relative overflow-hidden border-0 bg-linear-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-3">
                <div className="rounded-lg bg-dynamic-blue/10 p-2">
                  <Clock className="h-5 w-5 text-dynamic-blue" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {t('link-shortener.analytics.activity_by_hour')}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t('link-shortener.analytics.hourly_distribution')}
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <HourlyChart clicksByHour={clicksByHour} />
            </CardContent>
          </Card>

          {/* Activity by Day of Week */}
          <WeeklyActivity clicksByDayOfWeek={clicksByDayOfWeek} />
        </div>

        {/* Device & Browser Analytics */}
        <DeviceAnalytics
          deviceTypes={deviceTypes}
          browsers={browsers}
          operatingSystems={operatingSystems}
          totalClicks={analytics?.total_clicks || 0}
        />

        {/* Daily Activity Chart */}
        <DailyActivityChart clicksByDay={clicksByDay} />

        {/* Geographic & Traffic Data */}
        <GeographicAnalytics
          topReferrers={topReferrers}
          topCountries={topCountries}
          topCities={topCities}
        />

        {/* Analytics Summary */}
        <AnalyticsSummary analytics={analytics} />
      </div>
    </div>
  );
}

async function fetchAnalyticsData(
  linkId: string
): Promise<AnalyticsData | null> {
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

    // Get clicks by day using RPC function (last 30 days)
    const { data: clicksByDay, error: clicksByDayError } = await sbAdmin.rpc(
      'get_clicks_by_day',
      { p_link_id: linkId, p_days: 30 }
    );

    if (clicksByDayError) {
      console.error('Error fetching clicks by day:', clicksByDayError);
    }

    // Get top referrers using RPC function
    const { data: topReferrers, error: topReferrersError } = await sbAdmin.rpc(
      'get_top_referrers',
      { p_link_id: linkId, p_limit: 10 }
    );

    if (topReferrersError) {
      console.error('Error fetching top referrers:', topReferrersError);
    }

    // Get top countries using RPC function
    const { data: topCountries, error: topCountriesError } = await sbAdmin.rpc(
      'get_top_countries',
      { p_link_id: linkId, p_limit: 10 }
    );

    if (topCountriesError) {
      console.error('Error fetching top countries:', topCountriesError);
    }

    // Get top cities using RPC function
    const { data: topCities, error: topCitiesError } = await sbAdmin.rpc(
      'get_top_cities',
      { p_link_id: linkId, p_limit: 10 }
    );

    if (topCitiesError) {
      console.error('Error fetching top cities:', topCitiesError);
    }

    // Get device types using RPC function
    const { data: deviceTypes, error: deviceTypesError } = await sbAdmin.rpc(
      'get_device_types',
      { p_link_id: linkId, p_limit: 10 }
    );

    if (deviceTypesError) {
      console.error('Error fetching device types:', deviceTypesError);
    }

    // Get browsers using RPC function
    const { data: browsers, error: browsersError } = await sbAdmin.rpc(
      'get_browsers',
      { p_link_id: linkId, p_limit: 10 }
    );

    if (browsersError) {
      console.error('Error fetching browsers:', browsersError);
    }

    // Get operating systems using RPC function
    const { data: operatingSystems, error: operatingSystemsError } =
      await sbAdmin.rpc('get_operating_systems', {
        p_link_id: linkId,
        p_limit: 10,
      });

    if (operatingSystemsError) {
      console.error('Error fetching operating systems:', operatingSystemsError);
    }

    // Get clicks by hour using RPC function
    const { data: clicksByHour, error: clicksByHourError } = await sbAdmin.rpc(
      'get_clicks_by_hour',
      { p_link_id: linkId }
    );

    if (clicksByHourError) {
      console.error('Error fetching clicks by hour:', clicksByHourError);
    }

    // Get clicks by day of week using RPC function
    const { data: clicksByDayOfWeek, error: clicksByDayOfWeekError } =
      await sbAdmin.rpc('get_clicks_by_day_of_week', { p_link_id: linkId });

    if (clicksByDayOfWeekError) {
      console.error(
        'Error fetching clicks by day of week:',
        clicksByDayOfWeekError
      );
    }

    // Format the data for the UI
    const clicksByDayProcessed = (clicksByDay || []).map((day) => ({
      date: day.click_date,
      clicks: Number(day.clicks),
    }));

    const topReferrersProcessed = (topReferrers || []).map((ref) => ({
      domain: ref.domain,
      count: Number(ref.count),
    }));

    const topCountriesProcessed = (topCountries || []).map((country) => ({
      country: country.country,
      count: Number(country.count),
    }));

    const topCitiesProcessed = (topCities || []).map((city) => ({
      city: city.city,
      country: city.country,
      count: Number(city.count),
    }));

    const deviceTypesProcessed = (deviceTypes || []).map((device) => ({
      device_type: device.device_type,
      count: Number(device.count),
    }));

    const browsersProcessed = (browsers || []).map((browser) => ({
      browser: browser.browser,
      count: Number(browser.count),
    }));

    const operatingSystemsProcessed = (operatingSystems || []).map((os) => ({
      os: os.os,
      count: Number(os.count),
    }));

    const clicksByHourProcessed = (clicksByHour || []).map((hour) => ({
      hour: hour.hour,
      clicks: Number(hour.clicks),
    }));

    const clicksByDayOfWeekProcessed = (clicksByDayOfWeek || []).map((day) => ({
      day_of_week: day.day_of_week,
      day_name: day.day_name,
      clicks: Number(day.clicks),
    }));

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
      topCities: topCitiesProcessed,
      deviceTypes: deviceTypesProcessed,
      browsers: browsersProcessed,
      operatingSystems: operatingSystemsProcessed,
      clicksByHour: clicksByHourProcessed,
      clicksByDayOfWeek: clicksByDayOfWeekProcessed,
    };
  } catch (error) {
    console.error('Failed to fetch analytics data:', error);
    return null;
  }
}
