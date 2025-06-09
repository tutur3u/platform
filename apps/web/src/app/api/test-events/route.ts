import { DEV_MODE } from '@/constants/common';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { NextRequest, NextResponse } from 'next/server';

// Helper to add minutes to a date
const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60000);
};

export async function POST(request: NextRequest) {
  if (!DEV_MODE) {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  const { wsId, count = 1000 } = await request.json();

  if (!wsId) {
    return NextResponse.json(
      { error: 'Workspace ID is required' },
      { status: 400 }
    );
  }

  // Permission check
  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('manage_calendar')) {
    return NextResponse.json(
      { error: 'You do not have permission to manage calendar' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  // Define active hours for event generation
  const ACTIVE_HOURS_START = 8; // 8 AM
  const ACTIVE_HOURS_END = 23; // 11 PM

  // 1. Clear existing events for a clean slate
  await supabase.from('workspace_calendar_events').delete().eq('ws_id', wsId);

  // 2. Generate events sequentially to be back-to-back
  const generatedEvents = [];
  const startDate = new Date();
  startDate.setHours(ACTIVE_HOURS_START, 0, 0, 0);

  let cursorTime = new Date(startDate);

  for (let i = 0; i < count; i++) {
    // Varying durations from 15 minutes to 4 hours (240 minutes)
    const durationInMinutes = (Math.floor(Math.random() * 16) + 1) * 15;

    const eventStartTime = new Date(cursorTime);
    const eventEndTime = addMinutes(eventStartTime, durationInMinutes);

    // If event ends after active hours, move to the next day and retry this iteration
    if (
      eventEndTime.getHours() >= ACTIVE_HOURS_END ||
      eventEndTime.getDate() > eventStartTime.getDate()
    ) {
      cursorTime.setDate(cursorTime.getDate() + 1);
      cursorTime.setHours(ACTIVE_HOURS_START, 0, 0, 0);
      i--; // Decrement to ensure we still generate the correct total `count` of events
      continue;
    }

    generatedEvents.push({
      title: `Generated Event ${i + 1}`,
      start_at: eventStartTime.toISOString(),
      end_at: eventEndTime.toISOString(),
    });

    // Move cursor to the end of the current event
    cursorTime = new Date(eventEndTime);

    // Add a random pre-determined break (0 or 15 minutes)
    const gapInMinutes = Math.random() < 0.5 ? 0 : 15;
    cursorTime = addMinutes(cursorTime, gapInMinutes);
  }

  const availableColors: SupportedColor[] = [
    'BLUE',
    'GREEN',
    'RED',
    'YELLOW',
    'PURPLE',
    'PINK',
    'ORANGE',
    'INDIGO',
    'CYAN',
    'GRAY',
  ];

  const allTestEvents = generatedEvents.map((event) => ({
    ...event,
    ws_id: wsId,
    description: 'This is an auto-generated test event.',
    color: availableColors[Math.floor(Math.random() * availableColors.length)],
  }));

  const { error } = await supabase
    .from('workspace_calendar_events')
    .insert(allTestEvents);

  if (error) {
    console.error('Failed to generate test events:', error);
    return NextResponse.json(
      { error: 'Failed to create test events' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `Generated ${allTestEvents.length} new test events.`,
  });
}
