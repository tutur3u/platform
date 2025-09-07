import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { isAllDayEvent } from '@tuturuuu/ui/hooks/calendar-utils';
import { Calendar, MapPin } from '@tuturuuu/ui/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import UpcomingEventDetails from './upcoming-event-details';

interface UpcomingCalendarEventsProps {
  wsId: string;
}

export default async function UpcomingCalendarEvents({
  wsId,
}: UpcomingCalendarEventsProps) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');

  dayjs.extend(relativeTime);

  // Get upcoming events (next 7 days)
  const now = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(now.getDate() + 7);

  const { data: allEvents, error } = await supabase
    .from('workspace_calendar_events')
    .select('*')
    .eq('ws_id', wsId)
    .gte('start_at', now.toISOString())
    .lte('start_at', sevenDaysFromNow.toISOString())
    .order('start_at', { ascending: true })
    .limit(25); // Get more events to account for filtering

  if (error) {
    console.error('Error fetching upcoming events:', error);
    return null;
  }

  // Filter out all-day events and limit to 5
  const upcomingEvents =
    allEvents?.filter((event) => !isAllDayEvent(event)).slice(0, 5) || [];

  return (
    <Card className="overflow-hidden border-dynamic-cyan/20 transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-cyan/20 border-b bg-gradient-to-r from-dynamic-cyan/5 to-dynamic-blue/5 p-4">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <div className="rounded-lg bg-dynamic-cyan/10 p-1.5 text-dynamic-cyan">
            <Calendar className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('next_up_on_calendar')}</div>
        </CardTitle>
        <Link href={`/${wsId}/calendar`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 transition-colors hover:bg-dynamic-cyan/10 hover:text-dynamic-cyan"
          >
            <Calendar className="mr-1 h-3 w-3" />
            {t('view_calendar')}
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        {upcomingEvents && upcomingEvents.length > 0 ? (
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                className="group rounded-xl border border-dynamic-cyan/10 bg-gradient-to-br from-dynamic-cyan/5 to-dynamic-blue/5 p-4 transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="line-clamp-1 font-semibold text-sm">
                      {event.title || 'Untitled Event'}
                    </div>

                    {event.description && (
                      <p className="line-clamp-2 text-dynamic-cyan/70 text-xs">
                        {event.description}
                      </p>
                    )}

                    <UpcomingEventDetails event={event} />

                    {event.location && (
                      <div className="flex items-center gap-2 text-dynamic-cyan/60 text-xs">
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 flex-none text-dynamic-cyan/80" />
                          <span className="line-clamp-2 font-medium">
                            {event.location}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 to-dynamic-slate/10">
              <Calendar className="h-8 w-8 text-dynamic-gray/60" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-base text-dynamic-gray">
                {t('no_upcoming_events')}
              </h3>
              <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
                {t('no_upcoming_events_description')}
              </p>
            </div>
            <div className="mt-6">
              <Link href={`/${wsId}/calendar`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dynamic-cyan/20 text-dynamic-cyan transition-all duration-200 hover:border-dynamic-cyan/30 hover:bg-dynamic-cyan/10"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {t('view_calendar')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
