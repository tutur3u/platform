import { ArrowRight, Calendar, Clock } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { format } from 'date-fns';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { decryptEventsFromStorage } from '@/lib/workspace-encryption';

interface CompactCalendarSummaryProps {
  wsId: string;
}

export default async function CompactCalendarSummary({
  wsId,
}: CompactCalendarSummaryProps) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');

  const now = new Date();
  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(now.getDate() + 2);

  const { data: allEvents, error } = await supabase
    .from('workspace_calendar_events')
    .select('*')
    .eq('ws_id', wsId)
    .gte('start_at', now.toISOString())
    .lte('start_at', twoDaysFromNow.toISOString())
    .order('start_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Error fetching calendar summary:', error);
    return null;
  }

  const decryptedEvents = await decryptEventsFromStorage(allEvents || [], wsId);
  const viewableEvents = decryptedEvents.filter((e) => !e.is_encrypted);
  const upcomingEvents = viewableEvents
    .filter((event) => !isAllDayEvent(event))
    .slice(0, 3);

  return (
    <Card className="min-w-0 border-0 bg-transparent shadow-none">
      <CardHeader className="px-2 pt-2 pb-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-xs">
            <Calendar className="h-4 w-4 shrink-0 text-dynamic-cyan" />
            <span className="truncate">{t('compact_calendar_title')}</span>
          </CardTitle>
          <Link href={`/${wsId}/calendar`} className="shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[11px]"
            >
              {t('view_all')}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        {upcomingEvents.length === 0 ? (
          <p className="min-w-0 truncate text-muted-foreground text-xs">
            {t('compact_calendar_empty')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                className="flex min-w-0 items-start gap-2 rounded-md bg-muted/20 p-1.5"
              >
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dynamic-cyan" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate font-medium text-[11px]">
                    {event.title || t('compact_calendar_untitled')}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {format(new Date(event.start_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
