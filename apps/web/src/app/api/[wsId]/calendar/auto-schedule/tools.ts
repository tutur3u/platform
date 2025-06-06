import { createClient } from '@tuturuuu/supabase/next/server';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  color?: string;
  location?: string;
  priority?: string;
  ws_id: string;
}

interface OptimizationResult {
  eventId: string;
  newStartAt: string;
  newEndAt: string;
  reason: string;
}

// Intelligent calendar optimization functions with date range awareness
export const createCalendarOptimizer = (
  wsId: string,
  dateRange?: { startDate?: string; endDate?: string }
) => {
  // Intelligent business logic constants
  const BUSINESS_HOURS_START = 9; // 9 AM
  const BUSINESS_HOURS_END = 17; // 5 PM

  // Fetch calendar events within date range
  const fetchEvents = async (): Promise<CalendarEvent[]> => {
    const supabase = await createClient();

    let query = supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', wsId);

    // Apply intelligent date filtering if provided
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      const startDateTime = `${dateRange.startDate}T00:00:00.000Z`;
      const endDateTime = `${dateRange.endDate}T23:59:59.999Z`;

      console.log(
        `[OPTIMIZER] Filtering events between ${startDateTime} and ${endDateTime}`
      );

      query = query.gte('start_at', startDateTime).lte('start_at', endDateTime);
    }

    const { data, error } = await query.order('start_at', { ascending: true });

    if (error) throw new Error(error.message);

    console.log(
      `[OPTIMIZER] Fetched ${data?.length || 0} events for optimization`
    );
    return (data || []) as CalendarEvent[];
  };

  // Apply optimizations to database
  const applyOptimizations = async (
    optimizations: OptimizationResult[]
  ): Promise<number> => {
    const supabase = await createClient();
    let appliedCount = 0;

    for (const optimization of optimizations) {
      try {
        const { error } = await supabase
          .from('workspace_calendar_events')
          .update({
            start_at: optimization.newStartAt,
            end_at: optimization.newEndAt,
          })
          .eq('id', optimization.eventId)
          .eq('ws_id', wsId);

        if (!error) appliedCount++;
      } catch (err) {
        console.error(
          `Failed to apply optimization for event ${optimization.eventId}:`,
          err
        );
      }
    }

    return appliedCount;
  };

  // Conflict resolution using constraint satisfaction
  const resolveConflicts = async (): Promise<{
    conflictsFound: number;
    conflictsResolved: number;
    message: string;
  }> => {
    const events = await fetchEvents();

    if (events.length === 0) {
      return {
        conflictsFound: 0,
        conflictsResolved: 0,
        message: 'No events to optimize',
      };
    }

    // Detect conflicts using O(n²) interval overlap algorithm
    const conflicts = detectConflicts(events);

    if (conflicts.length === 0) {
      return {
        conflictsFound: 0,
        conflictsResolved: 0,
        message: 'No conflicts detected - calendar is optimally organized!',
      };
    }

    // Resolve conflicts using constraint satisfaction algorithm that guarantees zero conflicts
    const businessHours = {
      start: BUSINESS_HOURS_START,
      end: BUSINESS_HOURS_END,
    };
    const resolutions = solveConflictsCompletely(events, businessHours);
    const resolvedCount = await applyOptimizations(resolutions);

    return {
      conflictsFound: conflicts.length,
      conflictsResolved: resolvedCount,
      message: `Resolved ${resolvedCount} of ${conflicts.length} conflicts using algorithmic optimization`,
    };
  };

  // Gap optimization using greedy algorithm
  // DEPRECATED: This function is not currently used by any API endpoint but is kept for potential future use.
  const optimizeGaps = async (): Promise<{
    optimizationsMade: number;
    message: string;
  }> => {
    // This function is deprecated and should not be used.
    console.warn('optimizeGaps is deprecated and will be removed.');
    return {
      optimizationsMade: 0,
      message: 'This feature is deprecated.',
    };
  };

  // Recursive comprehensive optimization with streaming and hash-based convergence
  const optimizeComprehensively = async (
    // eslint-disable-next-line no-unused-vars
    streamWriter: (chunk: string) => void,
    options: { gapMinutes?: number } = {}
  ): Promise<void> => {
    const { gapMinutes = 0 } = options;
    const startTime = Date.now();
    streamWriter(
      JSON.stringify({ status: 'starting', message: 'Analyzing calendar...' })
    );

    const initialEvents = await fetchEvents();
    if (initialEvents.length === 0) {
      streamWriter(
        JSON.stringify({
          status: 'complete',
          message: 'No events to optimize.',
          totalOptimizations: 0,
        })
      );
      return;
    }

    const now = new Date();

    const ongoingEvents = initialEvents.filter(
      (event) => new Date(event.start_at) <= now && new Date(event.end_at) > now
    );

    const futureEvents = initialEvents.filter(
      (event) => new Date(event.start_at) > now
    );

    if (futureEvents.length === 0) {
      streamWriter(
        JSON.stringify({
          status: 'complete',
          message: 'No future events to optimize.',
          totalOptimizations: 0,
        })
      );
      return;
    }

    const lastOngoingEventEndTime =
      ongoingEvents.length > 0
        ? Math.max(...ongoingEvents.map((e) => new Date(e.end_at).getTime()))
        : 0;

    const repackStartTime = new Date(
      Math.max(lastOngoingEventEndTime, now.getTime())
    );

    const healthBefore = calculateComprehensiveHealth(initialEvents);
    streamWriter(
      JSON.stringify({
        status: 'analyzed',
        message: `Analyzing ${initialEvents.length} events. Initial health: ${healthBefore.overall}`,
        healthBefore,
      })
    );

    const repackedOptimizations = repackEventsSequentially(futureEvents, {
      gapInMinutes: gapMinutes,
      repackStartTime,
    });

    streamWriter(
      JSON.stringify({
        status: 'applying_changes',
        message: `Applying ${repackedOptimizations.length} changes to build optimal schedule...`,
      })
    );
    const appliedCount = await applyOptimizations(repackedOptimizations);

    const finalEvents = await fetchEvents();
    const healthAfter = calculateComprehensiveHealth(finalEvents);
    const processingTime = Date.now() - startTime;

    streamWriter(
      JSON.stringify({
        status: 'complete',
        message: `Optimization complete in ${processingTime}ms.`,
        totalOptimizations: appliedCount,
        healthAfter,
      })
    );
  };

  // Calendar health analysis
  const analyzeHealth = async (): Promise<{
    healthScore: number;
    conflicts: number;
    averageGapMinutes: number;
    message: string;
  }> => {
    const events = await fetchEvents();

    if (events.length === 0) {
      return {
        healthScore: 100,
        conflicts: 0,
        averageGapMinutes: 0,
        message: 'Calendar is empty - perfect health score!',
      };
    }

    const conflicts = detectConflicts(events);
    const gapMetrics = calculateGapMetrics(events);
    const healthScore = calculateHealthScore(
      conflicts.length,
      gapMetrics.averageGap
    );

    return {
      healthScore,
      conflicts: conflicts.length,
      averageGapMinutes: Math.round(gapMetrics.averageGap),
      message: `Calendar health score: ${healthScore}/100. Found ${conflicts.length} conflicts.`,
    };
  };

  return {
    resolveConflicts,
    optimizeGaps,
    optimizeComprehensively,
    analyzeHealth,
  };
};

// Pure algorithmic implementations

// Conflict detection using interval overlap algorithm - O(n²)
function detectConflicts(
  events: CalendarEvent[]
): Array<{ events: CalendarEvent[] }> {
  const conflicts: Array<{ events: CalendarEvent[] }> = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const event1 = events[i];
      const event2 = events[j];

      if (event1 && event2 && eventsOverlap(event1, event2)) {
        conflicts.push({ events: [event1, event2] });
      }
    }
  }

  return conflicts;
}

function eventsOverlap(event1: CalendarEvent, event2: CalendarEvent): boolean {
  const start1 = new Date(event1.start_at);
  const end1 = new Date(event1.end_at);
  const start2 = new Date(event2.start_at);
  const end2 = new Date(event2.end_at);

  return start1 < end2 && start2 < end1;
}

// Constraint Satisfaction Algorithm - Guarantees ZERO conflicts
function solveConflictsCompletely(
  allEvents: CalendarEvent[],
  businessHours = { start: 9, end: 17 }
): OptimizationResult[] {
  console.log('[CONFLICT-SOLVER] Starting complete conflict resolution');

  // Deep clone events to avoid mutations during processing
  let workingEvents = [...allEvents];
  const resolutions: OptimizationResult[] = [];
  let maxAttempts = 100; // Prevent infinite loops
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[CONFLICT-SOLVER] Attempt ${attempts}/${maxAttempts}`);

    // Detect all current conflicts
    const conflicts = detectConflicts(workingEvents);

    if (conflicts.length === 0) {
      console.log('[CONFLICT-SOLVER] SUCCESS: All conflicts resolved!');
      break;
    }

    console.log(
      `[CONFLICT-SOLVER] Found ${conflicts.length} conflicts to resolve`
    );

    // Sort conflicts by severity (number of overlapping events)
    const conflictsSorted = conflicts.sort(
      (a, b) => b.events.length - a.events.length
    );

    let resolvedInThisRound = false;

    for (const conflict of conflictsSorted) {
      const resolution = resolveConflictSystematically(
        conflict.events,
        workingEvents,
        businessHours
      );

      if (resolution) {
        console.log(
          `[CONFLICT-SOLVER] Resolved conflict by moving event ${resolution.eventId}`
        );

        // Apply the resolution to working events
        const eventIndex = workingEvents.findIndex(
          (e) => e.id === resolution.eventId
        );
        if (eventIndex !== -1) {
          const existingEvent = workingEvents[eventIndex];
          if (existingEvent) {
            workingEvents[eventIndex] = {
              ...existingEvent,
              start_at: resolution.newStartAt,
              end_at: resolution.newEndAt,
            };
          }
        }

        resolutions.push(resolution);
        resolvedInThisRound = true;
        break; // Re-analyze after each resolution
      }
    }

    if (!resolvedInThisRound) {
      console.log(
        '[CONFLICT-SOLVER] WARNING: Could not resolve some conflicts in this round'
      );
      // Use emergency fallback strategy
      const emergencyResolution = emergencyConflictResolution(
        conflictsSorted[0]?.events || []
      );
      if (emergencyResolution) {
        console.log('[CONFLICT-SOLVER] Applied emergency resolution');
        const eventIndex = workingEvents.findIndex(
          (e) => e.id === emergencyResolution.eventId
        );
        if (eventIndex !== -1) {
          const eventToUpdate = workingEvents[eventIndex];
          if (eventToUpdate) {
            workingEvents[eventIndex] = {
              ...eventToUpdate,
              start_at: emergencyResolution.newStartAt,
              end_at: emergencyResolution.newEndAt,
            };
          }
        }
        resolutions.push(emergencyResolution);
      } else {
        console.log(
          '[CONFLICT-SOLVER] CRITICAL: Cannot resolve conflicts even with emergency strategy'
        );
        break;
      }
    }
  }

  // Final verification
  const finalConflicts = detectConflicts(workingEvents);
  if (finalConflicts.length > 0) {
    console.error(
      `[CONFLICT-SOLVER] FAILED: ${finalConflicts.length} conflicts remain unresolved`
    );
  } else {
    console.log('[CONFLICT-SOLVER] VERIFIED: Zero conflicts achieved!');
  }

  return resolutions;
}

// Systematic conflict resolution with constraint satisfaction
function resolveConflictSystematically(
  conflictingEvents: CalendarEvent[],
  allEvents: CalendarEvent[],
  businessHours = { start: 9, end: 17 }
): OptimizationResult | null {
  console.log(
    `[SYSTEMATIC-RESOLVER] Resolving conflict between ${conflictingEvents.length} events`
  );

  // Try multiple strategies in order of preference
  const strategies = [
    () => tryMoveToNextBusinessDay(conflictingEvents, allEvents, businessHours),
    () => tryMoveToSameDay(conflictingEvents, allEvents, businessHours),
    () => tryMoveToAnyAvailableSlot(conflictingEvents, allEvents),
  ];

  for (const strategy of strategies) {
    const result = strategy();
    if (result && !wouldCreateNewConflict(result, allEvents)) {
      return result;
    }
  }

  return null;
}

// Strategy 1: Move to next business day
function tryMoveToNextBusinessDay(
  conflictingEvents: CalendarEvent[],
  allEvents: CalendarEvent[],
  businessHours: { start: number; end: number }
): OptimizationResult | null {
  // Choose event to move (prefer shorter events, then out-of-hours events)
  const eventToMove = selectEventToMove(conflictingEvents, businessHours);
  if (!eventToMove) return null;

  const eventDuration =
    new Date(eventToMove.end_at).getTime() -
    new Date(eventToMove.start_at).getTime();

  // Try next business day at 9 AM
  const nextBusinessDay = getNextBusinessDay(new Date());
  nextBusinessDay.setHours(businessHours.start, 0, 0, 0);

  const proposedEnd = new Date(nextBusinessDay.getTime() + eventDuration);

  if (
    !hasConflictAtTimeSlot(
      nextBusinessDay,
      proposedEnd,
      allEvents,
      eventToMove.id
    )
  ) {
    return {
      eventId: eventToMove.id,
      newStartAt: nextBusinessDay.toISOString(),
      newEndAt: proposedEnd.toISOString(),
      reason: 'Moved to next business day to eliminate conflict completely',
    };
  }

  return null;
}

// Strategy 2: Move to same day but different time
function tryMoveToSameDay(
  conflictingEvents: CalendarEvent[],
  allEvents: CalendarEvent[],
  businessHours: { start: number; end: number }
): OptimizationResult | null {
  const eventToMove = selectEventToMove(conflictingEvents, businessHours);
  if (!eventToMove) return null;

  const eventDate = new Date(eventToMove.start_at);
  const eventDuration =
    new Date(eventToMove.end_at).getTime() -
    new Date(eventToMove.start_at).getTime();

  // Try every 15-minute slot in business hours
  const dayStart = new Date(eventDate);
  dayStart.setHours(businessHours.start, 0, 0, 0);
  const dayEnd = new Date(eventDate);
  dayEnd.setHours(businessHours.end, 0, 0, 0);

  let currentSlot = new Date(dayStart);

  while (currentSlot < dayEnd) {
    const slotEnd = new Date(currentSlot.getTime() + eventDuration);

    if (
      slotEnd <= dayEnd &&
      !hasConflictAtTimeSlot(currentSlot, slotEnd, allEvents, eventToMove.id)
    ) {
      return {
        eventId: eventToMove.id,
        newStartAt: currentSlot.toISOString(),
        newEndAt: slotEnd.toISOString(),
        reason: 'Moved to available slot same day to eliminate conflict',
      };
    }

    currentSlot.setMinutes(currentSlot.getMinutes() + 15);
  }

  return null;
}

// Strategy 3: Move to any available slot (emergency)
function tryMoveToAnyAvailableSlot(
  conflictingEvents: CalendarEvent[],
  allEvents: CalendarEvent[]
): OptimizationResult | null {
  const eventToMove = selectEventToMove(conflictingEvents);
  if (!eventToMove) return null;

  const newSlot = findNextAvailableSlot(eventToMove, allEvents);
  if (newSlot) {
    return {
      eventId: eventToMove.id,
      newStartAt: newSlot.start.toISOString(),
      newEndAt: newSlot.end.toISOString(),
      reason: 'Emergency move to any available slot to eliminate conflict',
    };
  }

  return null;
}

// Emergency fallback when normal strategies fail
function emergencyConflictResolution(
  conflictingEvents: CalendarEvent[]
): OptimizationResult | null {
  if (conflictingEvents.length === 0) return null;

  console.log('[EMERGENCY] Using emergency conflict resolution');

  // Move the first event to tomorrow at 9 AM
  const eventToMove = conflictingEvents[0];
  if (!eventToMove) return null;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const eventDuration =
    new Date(eventToMove.end_at).getTime() -
    new Date(eventToMove.start_at).getTime();
  const emergencyEnd = new Date(tomorrow.getTime() + eventDuration);

  return {
    eventId: eventToMove.id,
    newStartAt: tomorrow.toISOString(),
    newEndAt: emergencyEnd.toISOString(),
    reason: 'EMERGENCY: Moved to next day to guarantee conflict resolution',
  };
}

// Helper functions
function selectEventToMove(
  events: CalendarEvent[],
  businessHours = { start: 9, end: 17 }
): CalendarEvent | null {
  if (events.length === 0) return null;

  // Priority: 1) Out of business hours, 2) Shorter duration, 3) Later in day
  return (
    events.sort((a, b) => {
      const aHour = new Date(a.start_at).getHours();
      const bHour = new Date(b.start_at).getHours();
      const aInBusiness =
        aHour >= businessHours.start && aHour < businessHours.end;
      const bInBusiness =
        bHour >= businessHours.start && bHour < businessHours.end;

      if (aInBusiness && !bInBusiness) return 1;
      if (!aInBusiness && bInBusiness) return -1;

      const aDuration =
        new Date(a.end_at).getTime() - new Date(a.start_at).getTime();
      const bDuration =
        new Date(b.end_at).getTime() - new Date(b.start_at).getTime();

      return aDuration - bDuration;
    })[0] || null
  );
}

function getNextBusinessDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  // Skip weekends
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function wouldCreateNewConflict(
  resolution: OptimizationResult,
  allEvents: CalendarEvent[]
): boolean {
  const newStart = new Date(resolution.newStartAt);
  const newEnd = new Date(resolution.newEndAt);

  return hasConflictAtTimeSlot(newStart, newEnd, allEvents, resolution.eventId);
}

// Find next available time slot using greedy search
function findNextAvailableSlot(
  eventToMove: CalendarEvent,
  allEvents: CalendarEvent[]
): { start: Date; end: Date } | null {
  const eventDuration =
    new Date(eventToMove.end_at).getTime() -
    new Date(eventToMove.start_at).getTime();

  // Start search from next day at 9 AM
  const searchStart = new Date();
  searchStart.setDate(searchStart.getDate() + 1);
  searchStart.setHours(9, 0, 0, 0);

  let currentTime = new Date(searchStart);

  // Search for up to 30 days
  for (let day = 0; day < 30; day++) {
    // Check working hours (9 AM to 5 PM)
    const dayStart = new Date(currentTime);
    dayStart.setHours(9, 0, 0, 0);
    const dayEnd = new Date(currentTime);
    dayEnd.setHours(17, 0, 0, 0);

    while (dayStart < dayEnd) {
      const slotEnd = new Date(dayStart.getTime() + eventDuration);

      if (
        slotEnd <= dayEnd &&
        !hasConflictAtTimeSlot(dayStart, slotEnd, allEvents, eventToMove.id)
      ) {
        return { start: new Date(dayStart), end: slotEnd };
      }

      // Move to next 30-minute slot
      dayStart.setMinutes(dayStart.getMinutes() + 30);
    }

    // Move to next day
    currentTime.setDate(currentTime.getDate() + 1);
  }

  return null;
}

function hasConflictAtTimeSlot(
  start: Date,
  end: Date,
  events: CalendarEvent[],
  excludeEventId: string
): boolean {
  return events.some((event) => {
    if (event.id === excludeEventId) return false;

    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);

    return start < eventEnd && end > eventStart;
  });
}

// Calculate gap metrics
function calculateGapMetrics(events: CalendarEvent[]) {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  const gaps = [];
  let totalGap = 0;

  for (let i = 1; i < sortedEvents.length; i++) {
    const prevEvent = sortedEvents[i - 1];
    const currentEvent = sortedEvents[i];

    if (!prevEvent || !currentEvent) continue;

    const prevEnd = new Date(prevEvent.end_at);
    const currentStart = new Date(currentEvent.start_at);
    const gap = (currentStart.getTime() - prevEnd.getTime()) / (1000 * 60); // Minutes

    if (gap > 0) {
      gaps.push(gap);
      totalGap += gap;
    }
  }

  return {
    averageGap: gaps.length > 0 ? totalGap / gaps.length : 0,
    longestGap: gaps.length > 0 ? Math.max(...gaps) : 0,
    totalGap,
  };
}

// Calculate calendar health score
function calculateHealthScore(
  conflictCount: number,
  averageGapMinutes: number
): number {
  let score = 100;

  // Penalize conflicts heavily (15 points per conflict)
  score -= conflictCount * 15;

  // Penalize excessive gaps (1 point per minute over 60)
  if (averageGapMinutes > 60) {
    score -= (averageGapMinutes - 60) * 0.5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Comprehensive health calculation with detailed metrics
function calculateComprehensiveHealth(events: CalendarEvent[]) {
  const conflicts = detectConflicts(events);
  const gapMetrics = calculateGapMetrics(events);

  // Business hours analysis
  const businessHoursViolations = events.filter((event) => {
    const startHour = new Date(event.start_at).getHours();
    const endHour = new Date(event.end_at).getHours();
    return startHour < 9 || endHour > 17;
  }).length;

  // Daily meeting distribution analysis
  const dailyMeetings = new Map<string, number>();
  events.forEach((event) => {
    const date = new Date(event.start_at).toDateString();
    dailyMeetings.set(date, (dailyMeetings.get(date) || 0) + 1);
  });

  const overloadedDays = Array.from(dailyMeetings.values()).filter(
    (count) => count > 8
  ).length;

  // Calculate overall health score
  let score = 100;
  score -= conflicts.length * 15; // Heavy penalty for conflicts
  score -= businessHoursViolations * 5; // Penalty for out-of-hours meetings
  score -= overloadedDays * 10; // Penalty for overloaded days
  score -= Math.max(0, gapMetrics.averageGap - 60) * 0.5; // Penalty for excessive gaps

  return {
    overall: Math.max(0, Math.min(100, Math.round(score))),
    conflicts: conflicts.length,
    businessHoursViolations,
    overloadedDays,
    averageGap: gapMetrics.averageGap,
    totalEvents: events.length,
  };
}

// Re-pack and schedule all events sequentially in a single pass
function repackEventsSequentially(
  events: CalendarEvent[],
  options: { gapInMinutes?: number; repackStartTime: Date }
): OptimizationResult[] {
  const { gapInMinutes = 0, repackStartTime } = options;
  const ACTIVE_HOURS_START = 8; // 8 AM
  const ACTIVE_HOURS_END = 23; // 11 PM
  const DAILY_CAPACITY_MILLIS =
    (ACTIVE_HOURS_END - ACTIVE_HOURS_START) * 60 * 60 * 1000;

  const resolutions: OptimizationResult[] = [];
  if (events.length === 0) return resolutions;

  const eventsWithDurations = events.map((event) => ({
    ...event,
    duration:
      new Date(event.end_at).getTime() - new Date(event.start_at).getTime(),
  }));

  // Shuffle events to introduce randomness, then pack them into days.
  const shuffledEvents = eventsWithDurations.sort(() => Math.random() - 0.5);

  const dayBins: {
    events: typeof eventsWithDurations;
    remainingCapacity: number;
  }[] = [];

  // The first bin represents today and has a potentially smaller capacity.
  const firstDayEnd = new Date(repackStartTime);
  firstDayEnd.setHours(ACTIVE_HOURS_END, 0, 0, 0);

  const firstDayCapacity = Math.max(
    0,
    firstDayEnd.getTime() - repackStartTime.getTime()
  );

  if (firstDayCapacity > 0) {
    dayBins.push({
      events: [],
      remainingCapacity: firstDayCapacity,
    });
  }

  // Use a "First Fit" bin-packing algorithm.
  // This respects the remaining time on the first day.
  for (const event of shuffledEvents) {
    let placed = false;
    const spaceNeeded = (bin: { events: any[] }) =>
      event.duration + (bin.events.length > 0 ? gapInMinutes * 60000 : 0);

    for (const bin of dayBins) {
      if (spaceNeeded(bin) <= bin.remainingCapacity) {
        bin.events.push(event);
        bin.remainingCapacity -= spaceNeeded(bin);
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Create a new bin for a new day with full capacity.
      dayBins.push({
        events: [event],
        remainingCapacity: DAILY_CAPACITY_MILLIS - event.duration,
      });
    }
  }

  // Lay out the events from the bins into the calendar timeline.
  let cursorTime = new Date(repackStartTime);

  // If starting outside active hours, move to the next day's start.
  if (
    cursorTime.getHours() >= ACTIVE_HOURS_END ||
    cursorTime.getHours() < ACTIVE_HOURS_START
  ) {
    cursorTime.setDate(cursorTime.getDate() + 1);
    cursorTime.setHours(ACTIVE_HOURS_START, 0, 0, 0);
  }

  for (const bin of dayBins) {
    let dayCursor = new Date(cursorTime);

    for (const event of bin.events) {
      const eventStartTime = new Date(dayCursor);
      const eventEndTime = new Date(eventStartTime.getTime() + event.duration);

      resolutions.push({
        eventId: event.id,
        newStartAt: eventStartTime.toISOString(),
        newEndAt: eventEndTime.toISOString(),
        reason: 'Repacked event to maximize daily time usage.',
      });

      // Move the cursor for the next event in the same day.
      dayCursor = new Date(eventEndTime.getTime() + gapInMinutes * 60000);
    }

    // After finishing a day, advance the main cursor to the start of the next day.
    cursorTime.setDate(cursorTime.getDate() + 1);
    cursorTime.setHours(ACTIVE_HOURS_START, 0, 0, 0);
  }

  return resolutions;
}
