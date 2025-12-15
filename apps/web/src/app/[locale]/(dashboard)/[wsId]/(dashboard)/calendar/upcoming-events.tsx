import {
  ArrowRight,
  Calendar,
  CalendarClock,
  Lock,
  Sparkles,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { decryptEventsFromStorage } from '@/lib/workspace-encryption';
import ExpandableEventList from './expandable-event-list';

interface UpcomingCalendarEventsProps {
  wsId: string;
  showNavigation?: boolean;
}

export default async function UpcomingCalendarEvents({
  wsId,
  showNavigation = false,
}: UpcomingCalendarEventsProps) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');

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
    .limit(25);

  if (error) {
    console.error('Error fetching upcoming events:', error);
    return null;
  }

  // Decrypt events with robust error handling
  let decryptionFailed = false;
  let encryptedEventsCount = 0;
  let decryptedEvents: typeof allEvents = [];

  try {
    decryptedEvents = await decryptEventsFromStorage(allEvents || [], wsId);
  } catch (decryptError) {
    console.error('Failed to decrypt calendar events:', decryptError);
    decryptionFailed = true;
    // Count encrypted events and filter to only unencrypted ones as fallback
    encryptedEventsCount = (allEvents || []).filter(
      (e) => e.is_encrypted
    ).length;
    decryptedEvents = (allEvents || []).filter((e) => !e.is_encrypted);
  }

  // Filter out all-day events and limit to 10
  const upcomingEvents =
    decryptedEvents?.filter((event) => !isAllDayEvent(event)).slice(0, 10) ||
    [];

  return (
    <Card className="group overflow-hidden border-dynamic-cyan/20 bg-linear-to-br from-card via-card to-dynamic-cyan/5 shadow-lg ring-1 ring-dynamic-cyan/10 transition-all duration-300 hover:border-dynamic-cyan/30 hover:shadow-xl hover:ring-dynamic-cyan/20">
      <CardHeader className="space-y-0 border-dynamic-cyan/20 border-b bg-linear-to-r from-dynamic-cyan/10 via-dynamic-cyan/5 to-transparent p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 font-semibold text-base">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-xl bg-dynamic-cyan/20 blur-lg" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-cyan via-dynamic-cyan/90 to-dynamic-blue shadow-lg ring-2 ring-dynamic-cyan/30">
                <CalendarClock className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold">{t('next_up_on_calendar')}</span>
              <span className="font-medium text-dynamic-cyan text-xs">
                {upcomingEvents.length} {t('upcoming')}
              </span>
              {decryptionFailed && encryptedEventsCount > 0 && (
                <span className="flex items-center gap-1 text-dynamic-orange text-xs">
                  <Lock className="h-3 w-3" />
                  {encryptedEventsCount} {t('encrypted_events_unavailable')}
                </span>
              )}
            </div>
          </CardTitle>
          {showNavigation && (
            <Link href={`/${wsId}/calendar`}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-dynamic-cyan/30 bg-background/50 backdrop-blur-sm transition-all hover:border-dynamic-cyan hover:bg-dynamic-cyan/10 hover:text-dynamic-cyan"
              >
                {t('view_calendar')}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {upcomingEvents && upcomingEvents.length > 0 ? (
          <ExpandableEventList events={upcomingEvents} />
        ) : (
          <div className="py-8 text-center">
            <div className="relative mx-auto mb-4 w-fit">
              <div className="absolute inset-0 animate-pulse rounded-full bg-dynamic-cyan/20 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-dynamic-cyan/20 bg-linear-to-br from-dynamic-cyan/10 via-dynamic-cyan/5 to-transparent shadow-lg ring-4 ring-dynamic-cyan/10">
                <Sparkles className="h-8 w-8 text-dynamic-cyan/50" />
              </div>
            </div>
            <h3 className="font-semibold text-sm">{t('no_upcoming_events')}</h3>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('no_upcoming_events_description')}
            </p>
            <Link href={`/${wsId}/calendar`} className="mt-4 inline-block">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-dynamic-cyan/30 transition-all hover:border-dynamic-cyan hover:bg-dynamic-cyan/10 hover:text-dynamic-cyan"
              >
                <Calendar className="h-4 w-4" />
                {t('view_calendar')}
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
