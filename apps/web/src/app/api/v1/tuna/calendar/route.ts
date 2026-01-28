/**
 * Tuna Calendar API
 * GET /api/v1/tuna/calendar - Get user's upcoming calendar events
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { NextResponse } from 'next/server';
import { decryptEventsFromStorage } from '@/lib/workspace-encryption';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wsId = searchParams.get('wsId');

    if (!wsId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      return NextResponse.json(
        { error: 'Failed to fetch events' },
        { status: 500 }
      );
    }

    // Decrypt events
    const decryptedEvents = await decryptEventsFromStorage(
      allEvents || [],
      wsId
    );

    // Check for encrypted events that couldn't be decrypted
    const stillEncryptedEvents = decryptedEvents.filter((e) => e.is_encrypted);
    const encryptedEventsCount = stillEncryptedEvents.length;

    // Filter out encrypted events and all-day events
    const viewableEvents = decryptedEvents.filter((e) => !e.is_encrypted);
    const upcomingEvents = viewableEvents
      .filter((event) => !isAllDayEvent(event))
      .slice(0, 10);

    // Map to simplified format for Tuna
    const events = upcomingEvents.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      start_at: event.start_at,
      end_at: event.end_at,
      color: event.color,
      location: event.location,
    }));

    return NextResponse.json({
      events,
      stats: {
        total: events.length,
        encrypted_count: encryptedEventsCount,
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/v1/tuna/calendar:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
