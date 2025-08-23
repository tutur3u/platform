import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { isAllDayEvent } from '@tuturuuu/ui/hooks/calendar-utils';
import { Calendar, Clock, MapPin } from '@tuturuuu/ui/icons';
import { format, isThisWeek, isToday, isTomorrow } from 'date-fns';
import Link from 'next/link';

interface UpcomingCalendarEventsProps {
  wsId: string;
}

export default async function UpcomingCalendarEvents({
  wsId,
}: UpcomingCalendarEventsProps) {
  const supabase = await createClient();

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

  const getEventColor = (color: string | null) => {
    const colorMap: Record<string, string> = {
      RED: 'bg-red-500',
      ORANGE: 'bg-orange-500',
      YELLOW: 'bg-yellow-500',
      GREEN: 'bg-green-500',
      BLUE: 'bg-blue-500',
      PURPLE: 'bg-purple-500',
      PINK: 'bg-pink-500',
      CYAN: 'bg-cyan-500',
    };
    return colorMap[color || 'BLUE'] || 'bg-blue-500';
  };

  const getDateLabel = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isThisWeek(date)) return format(date, 'EEEE');
    return format(date, 'MMM d');
  };

  const formatEventTime = (startAt: string, endAt: string) => {
    const start = new Date(startAt);
    const end = new Date(endAt);

    if (isToday(start)) {
      return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
    }

    return `${format(start, 'MMM d, h:mm a')} - ${format(end, 'h:mm a')}`;
  };

  const isEventSoon = (startAt: string) => {
    const start = new Date(startAt);
    const diffInMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
    return diffInMinutes <= 30 && diffInMinutes > 0;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="font-semibold text-base">
          📅 Next Up on Calendar
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
              <div
                className={`h-full w-1 rounded-full ${getEventColor(event.color)} flex-shrink-0`}
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between">
                  <h4 className="font-medium leading-none">
                    {event.title || 'Untitled Event'}
                  </h4>
                  {isEventSoon(event.start_at) && (
                    <Badge
                      variant="destructive"
                      className="animate-pulse text-xs"
                    >
                      Starting Soon
                    </Badge>
                  )}
                </div>

                {event.description && (
                  <p className="line-clamp-2 text-muted-foreground text-xs">
                    {event.description}
                  </p>
                )}

                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{getDateLabel(event.start_at)}</span>
                  </div>
                  <span>•</span>
                  <span>{formatEventTime(event.start_at, event.end_at)}</span>
                </div>

                {event.location && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{event.location}</span>
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
