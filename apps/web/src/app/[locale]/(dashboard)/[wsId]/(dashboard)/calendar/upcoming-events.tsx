import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { isAllDayEvent } from '@tuturuuu/ui/hooks/calendar-utils';
import { Calendar, MapPin } from '@tuturuuu/ui/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Link from 'next/link';
import UpcomingEventDetails from './upcoming-event-details';

interface UpcomingCalendarEventsProps {
  wsId: string;
}

export default async function UpcomingCalendarEvents({
  wsId,
}: UpcomingCalendarEventsProps) {
  const supabase = await createClient();

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <Calendar className="h-5 w-5" />
          <div className="line-clamp-1">Next Up on Calendar</div>
        </CardTitle>
        <Link href={`/${wsId}/calendar`}>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Calendar className="mr-1 h-3 w-3" />
            View Calendar
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingEvents && upcomingEvents.length > 0 ? (
          upcomingEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 rounded-lg border bg-card/50 p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex-1 space-y-1">
                <div className="line-clamp-1 font-medium">
                  {event.title || 'Untitled Event'}
                </div>

                {event.description && (
                  <p className="line-clamp-2 text-muted-foreground text-xs">
                    {event.description}
                  </p>
                )}

                <UpcomingEventDetails event={event} />

                {event.location && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <div className="flex items-start gap-1">
                      <MapPin className="h-3 w-3 flex-none" />
                      <span className="line-clamp-2">{event.location}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <div className="mb-2">
              <Calendar className="mx-auto h-8 w-8 opacity-50" />
            </div>
            <p className="text-sm">No upcoming events</p>
            <p className="text-xs">
              Your calendar events for the next 7 days will appear here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
