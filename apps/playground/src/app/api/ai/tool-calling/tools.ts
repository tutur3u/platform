import { tool } from '@tuturuuu/ai/tools/core';
import { createClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';

export const fetchCalendarEvents = tool({
  description: 'Fetch calendar events',
  parameters: z.object({
    startDate: z.string().optional().describe('The start date of the events'),
    endDate: z.string().optional().describe('The end date of the events'),
  }),
  execute: async ({ startDate, endDate }) => {
    const supabase = await createClient();

    const queryBuilder = supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', '00000000-0000-0000-0000-000000000000')
      .limit(100);

    if (startDate) queryBuilder.gte('start_at', startDate);
    if (endDate) queryBuilder.lte('end_at', endDate);

    const { data, error } = await queryBuilder.order('start_at', {
      ascending: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(data);

    return {
      events: data,
    };
  },
});

export const checkEventClashes = tool({
  description: 'Check if a proposed event time clashes with existing events',
  parameters: z.object({
    startAt: z.string().describe('The proposed start date/time of the event'),
    endAt: z.string().describe('The proposed end date/time of the event'),
    excludeEventId: z
      .string()
      .optional()
      .describe(
        'Event ID to exclude from clash checking (useful when moving an existing event)'
      ),
  }),
  execute: async ({ startAt, endAt, excludeEventId }) => {
    const supabase = await createClient();

    let queryBuilder = supabase
      .from('workspace_calendar_events')
      .select('id, title, start_at, end_at')
      .eq('ws_id', '00000000-0000-0000-0000-000000000000')
      // Check for overlapping events: startA < endB AND startB < endA
      .lt('start_at', endAt)
      .gt('end_at', startAt);

    // Exclude the specified event ID if provided (useful for moving events)
    if (excludeEventId) {
      queryBuilder = queryBuilder.neq('id', excludeEventId);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(error.message);
    }

    const hasClashes = data && data.length > 0;

    return {
      hasClashes,
      clashingEvents: data || [],
      proposedTime: {
        startAt,
        endAt,
      },
      message: hasClashes
        ? `Found ${data.length} clashing event(s) between ${startAt} and ${endAt}`
        : `No clashes found for the time slot ${startAt} to ${endAt}`,
    };
  },
});

export const findAvailableTimeSlot = tool({
  description:
    'Find the next available time slot for an event of specified duration',
  parameters: z.object({
    durationMinutes: z.number().describe('Duration of the event in minutes'),
    preferredStartTime: z
      .string()
      .optional()
      .describe('Preferred start time (will search from this time onwards)'),
    searchDays: z
      .number()
      .optional()
      .describe('Number of days to search ahead (default: 7)'),
    workingHoursStart: z
      .string()
      .optional()
      .describe('Start of working hours in HH:MM format (default: 09:00)'),
    workingHoursEnd: z
      .string()
      .optional()
      .describe('End of working hours in HH:MM format (default: 17:00)'),
  }),
  execute: async ({
    durationMinutes,
    preferredStartTime,
    searchDays = 7,
    workingHoursStart = '09:00',
    workingHoursEnd = '17:00',
  }) => {
    const supabase = await createClient();

    // Ensure minimum duration
    if (durationMinutes <= 0) {
      durationMinutes = 30; // Default to 30 minutes for 0-duration events
    } else if (durationMinutes < 15) {
      durationMinutes = 15; // Minimum 15 minutes for very short events
    }

    // Get the search start time
    const startTime = preferredStartTime
      ? new Date(preferredStartTime)
      : new Date();

    // Round up to the next hour for cleaner scheduling
    startTime.setMinutes(0, 0, 0);
    if (startTime <= new Date()) {
      startTime.setHours(startTime.getHours() + 1);
    }

    const endSearchTime = new Date(startTime);
    endSearchTime.setDate(endSearchTime.getDate() + searchDays);

    // Fetch all events in the search period
    const { data: events, error } = await supabase
      .from('workspace_calendar_events')
      .select('start_at, end_at')
      .eq('ws_id', '00000000-0000-0000-0000-000000000000')
      .gte('start_at', startTime.toISOString())
      .lte('start_at', endSearchTime.toISOString())
      .order('start_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    // Helper function to parse time string (HH:MM) and apply to a date
    const applyTimeToDate = (date: Date, timeString: string) => {
      const [hours, minutes] = timeString.split(':').map(Number);
      const result = new Date(date);
      result.setHours(hours, minutes, 0, 0);
      return result;
    };

    // Find available slot
    let currentSearchTime = new Date(startTime);

    while (currentSearchTime < endSearchTime) {
      // Check if current time is within working hours
      const dayStart = applyTimeToDate(currentSearchTime, workingHoursStart);
      const dayEnd = applyTimeToDate(currentSearchTime, workingHoursEnd);

      if (currentSearchTime < dayStart) {
        currentSearchTime = dayStart;
        continue;
      }

      if (currentSearchTime >= dayEnd) {
        // Move to next day
        currentSearchTime.setDate(currentSearchTime.getDate() + 1);
        currentSearchTime = applyTimeToDate(
          currentSearchTime,
          workingHoursStart
        );
        continue;
      }

      const proposedEndTime = new Date(
        currentSearchTime.getTime() + durationMinutes * 60000
      );

      // Check if proposed end time exceeds working hours
      if (proposedEndTime > dayEnd) {
        // Move to next day
        currentSearchTime.setDate(currentSearchTime.getDate() + 1);
        currentSearchTime = applyTimeToDate(
          currentSearchTime,
          workingHoursStart
        );
        continue;
      }

      // Check for clashes with existing events
      const hasClash = events?.some((event) => {
        const eventStart = new Date(event.start_at);
        const eventEnd = new Date(event.end_at);

        // Check overlap: startA < endB AND startB < endA
        return currentSearchTime < eventEnd && eventStart < proposedEndTime;
      });

      if (!hasClash) {
        return {
          availableSlot: {
            startAt: currentSearchTime.toISOString(),
            endAt: proposedEndTime.toISOString(),
          },
          message: `Found available slot from ${currentSearchTime.toISOString()} to ${proposedEndTime.toISOString()}`,
        };
      }

      // Move to next hour and try again
      currentSearchTime.setHours(currentSearchTime.getHours() + 1);
    }

    return {
      availableSlot: null,
      message: `No available slot found for ${durationMinutes} minutes in the next ${searchDays} days`,
    };
  },
});

export const addEvent = tool({
  description: 'Add an event to the calendar',
  parameters: z.object({
    title: z.string().describe('The title of the event'),
    description: z.string().describe('The description of the event'),
    startAt: z.string().describe('The start date of the event'),
    endAt: z.string().describe('The end date of the event'),
  }),
  execute: async ({ title, description, startAt, endAt }) => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .insert({
        title,
        description,
        start_at: startAt,
        end_at: endAt,
        ws_id: '00000000-0000-0000-0000-000000000000',
      });

    if (error) {
      throw new Error(error.message);
    }

    return {
      event: data,
    };
  },
});

export const addBulkEvents = tool({
  description: 'Add multiple events to the calendar in a single operation',
  parameters: z.object({
    events: z
      .array(
        z.object({
          title: z.string().describe('The title of the event'),
          description: z.string().describe('The description of the event'),
          startAt: z.string().describe('The start date of the event'),
          endAt: z.string().describe('The end date of the event'),
        })
      )
      .describe('Array of events to add'),
  }),
  execute: async ({ events }) => {
    const supabase = await createClient();

    const eventsToInsert = events.map((event) => ({
      title: event.title,
      description: event.description,
      start_at: event.startAt,
      end_at: event.endAt,
      ws_id: '00000000-0000-0000-0000-000000000000',
    }));

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .insert(eventsToInsert)
      .select();

    if (error) {
      throw new Error(error.message);
    }

    return {
      events: data,
      count: data?.length || 0,
      message: `Successfully added ${data?.length || 0} events to the calendar`,
    };
  },
});

export const moveEvent = tool({
  description: 'Move an event to a new time',
  parameters: z.object({
    eventId: z.string().describe('The id of the event'),
    startAt: z.string().describe('The start date of the event'),
    endAt: z.string().describe('The end date of the event'),
  }),
  execute: async ({ eventId, startAt, endAt }) => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .update({ start_at: startAt, end_at: endAt })
      .eq('id', eventId);

    if (error) {
      throw new Error(error.message);
    }

    return {
      event: data,
    };
  },
});

export const updateBulkEvents = tool({
  description: 'Update multiple events in a single operation',
  parameters: z.object({
    updates: z
      .array(
        z.object({
          eventId: z.string().describe('The id of the event to update'),
          title: z.string().optional().describe('The new title of the event'),
          description: z
            .string()
            .optional()
            .describe('The new description of the event'),
          startAt: z
            .string()
            .optional()
            .describe('The new start date of the event'),
          endAt: z
            .string()
            .optional()
            .describe('The new end date of the event'),
        })
      )
      .describe('Array of event updates to apply'),
  }),
  execute: async ({ updates }) => {
    const supabase = await createClient();
    const results:
      | {
          color: string | null;
          created_at: string | null;
          description: string;
          end_at: string;
          google_event_id: string | null;
          id: string;
          location: string | null;
          locked: boolean;
          priority: string | null;
          start_at: string;
          title: string;
          ws_id: string;
        }[]
      | null = [];
    const errors: Array<{ eventId: string; error: string }> = [];

    // Process updates in parallel for better performance
    const updatePromises = updates.map(async (update) => {
      const updateData: {
        color: string | null;
        created_at: string | null;
        description: string;
        end_at: string;
        google_event_id: string | null;
        id: string;
        location: string | null;
        locked: boolean;
        priority: string | null;
        start_at: string;
        title: string;
        ws_id: string;
      } | null = null;

      if (update?.title !== undefined) updateData!.title = update.title;
      if (update?.description !== undefined)
        updateData!.description = update.description;
      if (update?.startAt !== undefined) updateData!.start_at = update.startAt;
      if (update?.endAt !== undefined) updateData!.end_at = update.endAt;

      if (!updateData) {
        return {
          eventId: update.eventId,
          data: null,
          error: 'No update data provided',
        };
      }

      const { data, error } = await supabase
        .from('workspace_calendar_events')
        .update(updateData)
        .eq('id', update.eventId)
        .select();

      return { eventId: update.eventId, data, error };
    });

    const updateResults = await Promise.all(updatePromises);

    updateResults.forEach((result) => {
      if (result.error) {
        errors.push({
          eventId: result.eventId,
          error:
            result.error instanceof Error ? result.error.message : result.error,
        });
      } else {
        if (result.data) {
          results.push(result.data[0]);
        }
      }
    });

    return {
      updatedEvents: results,
      successCount: results.length,
      errorCount: errors.length,
      errors: errors,
      message: `Successfully updated ${results.length} events${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
    };
  },
});

export const deleteBulkEvents = tool({
  description: 'Delete multiple events from the calendar in a single operation',
  parameters: z.object({
    eventIds: z.array(z.string()).describe('Array of event IDs to delete'),
  }),
  execute: async ({ eventIds }) => {
    const supabase = await createClient();

    // First, fetch the events that will be deleted for reporting
    const { data: eventsToDelete } = await supabase
      .from('workspace_calendar_events')
      .select('id, title, start_at, end_at')
      .in('id', eventIds);

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .delete()
      .in('id', eventIds)
      .select();

    if (error) {
      throw new Error(error.message);
    }

    return {
      deletedEvents: eventsToDelete || [],
      deletedCount: data?.length || 0,
      message: `Successfully deleted ${data?.length || 0} events from the calendar`,
    };
  },
});

export const checkBulkEventClashes = tool({
  description:
    'Check multiple proposed event times for clashes in a single operation',
  parameters: z.object({
    proposedEvents: z
      .array(
        z.object({
          id: z
            .string()
            .optional()
            .describe('Optional identifier for tracking this proposed event'),
          startAt: z
            .string()
            .describe('The proposed start date/time of the event'),
          endAt: z.string().describe('The proposed end date/time of the event'),
          excludeEventId: z
            .string()
            .optional()
            .describe('Event ID to exclude from clash checking'),
        })
      )
      .describe('Array of proposed events to check for clashes'),
  }),
  execute: async ({ proposedEvents }) => {
    const supabase = await createClient();
    const results: Array<{
      proposedEvent: { id: string; startAt: string; endAt: string };
      hasClashes: boolean;
      clashingEvents: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
        type: string;
      }[];
      message: string;
    }> = [];

    // Get all existing events in the time range we're checking
    const earliestStart = Math.min(
      ...proposedEvents.map((e) => new Date(e.startAt).getTime())
    );
    const latestEnd = Math.max(
      ...proposedEvents.map((e) => new Date(e.endAt).getTime())
    );

    const { data: existingEvents, error } = await supabase
      .from('workspace_calendar_events')
      .select('id, title, start_at, end_at')
      .eq('ws_id', '00000000-0000-0000-0000-000000000000')
      .lt('start_at', new Date(latestEnd).toISOString())
      .gt('end_at', new Date(earliestStart).toISOString());

    if (error) {
      throw new Error(error.message);
    }

    // Check each proposed event against existing events and other proposed events
    proposedEvents.forEach((proposedEvent, index) => {
      const clashingEvents: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
        type: string;
      }[] = [];

      // Check against existing events
      existingEvents?.forEach((existingEvent) => {
        if (
          proposedEvent.excludeEventId &&
          existingEvent.id === proposedEvent.excludeEventId
        ) {
          return; // Skip excluded event
        }

        const proposedStart = new Date(proposedEvent.startAt);
        const proposedEnd = new Date(proposedEvent.endAt);
        const existingStart = new Date(existingEvent.start_at);
        const existingEnd = new Date(existingEvent.end_at);

        // Check overlap: startA < endB AND startB < endA
        if (proposedStart < existingEnd && existingStart < proposedEnd) {
          clashingEvents.push({
            ...existingEvent,
            type: 'existing',
          });
        }
      });

      // Check against other proposed events (avoid internal conflicts)
      proposedEvents.forEach((otherProposed, otherIndex) => {
        if (index !== otherIndex) {
          const proposedStart = new Date(proposedEvent.startAt);
          const proposedEnd = new Date(proposedEvent.endAt);
          const otherStart = new Date(otherProposed.startAt);
          const otherEnd = new Date(otherProposed.endAt);

          if (proposedStart < otherEnd && otherStart < proposedEnd) {
            clashingEvents.push({
              id: otherProposed.id || `proposed-${otherIndex}`,
              title: 'Another proposed event',
              start_at: otherProposed.startAt,
              end_at: otherProposed.endAt,
              type: 'proposed',
            });
          }
        }
      });

      const hasClashes = clashingEvents.length > 0;

      results.push({
        proposedEvent: {
          id: proposedEvent.id || `event-${index}`,
          startAt: proposedEvent.startAt,
          endAt: proposedEvent.endAt,
        },
        hasClashes,
        clashingEvents,
        message: hasClashes
          ? `Found ${clashingEvents.length} clashing event(s) for proposed event ${proposedEvent.id || index + 1}`
          : `No clashes found for proposed event ${proposedEvent.id || index + 1}`,
      });
    });

    const totalClashes = results.filter((r) => r.hasClashes).length;

    return {
      results,
      summary: {
        totalChecked: proposedEvents.length,
        totalWithClashes: totalClashes,
        totalWithoutClashes: proposedEvents.length - totalClashes,
      },
      message: `Checked ${proposedEvents.length} proposed events: ${totalClashes} have conflicts, ${proposedEvents.length - totalClashes} are clear`,
    };
  },
});

export const scheduleMultipleEvents = tool({
  description:
    'Intelligently schedule multiple events by automatically finding available time slots for each',
  parameters: z.object({
    events: z
      .array(
        z.object({
          title: z.string().describe('The title of the event'),
          description: z.string().describe('The description of the event'),
          durationMinutes: z
            .number()
            .describe('Duration of the event in minutes'),
          preferredStartTime: z
            .string()
            .optional()
            .describe('Preferred start time for this specific event'),
          priority: z
            .number()
            .optional()
            .describe(
              'Priority level (1-10, higher = more important) for scheduling order'
            ),
        })
      )
      .describe('Array of events to schedule intelligently'),
    globalPreferences: z
      .object({
        workingHoursStart: z
          .string()
          .optional()
          .describe('Start of working hours in HH:MM format (default: 09:00)'),
        workingHoursEnd: z
          .string()
          .optional()
          .describe('End of working hours in HH:MM format (default: 17:00)'),
        bufferMinutes: z
          .number()
          .optional()
          .describe('Buffer time between events in minutes (default: 15)'),
        searchDays: z
          .number()
          .optional()
          .describe('Number of days to search ahead (default: 7)'),
        startFromTime: z
          .string()
          .optional()
          .describe('Earliest time to start scheduling from'),
      })
      .optional()
      .describe('Global scheduling preferences'),
  }),
  execute: async ({ events, globalPreferences = {} }) => {
    const supabase = await createClient();

    const {
      workingHoursStart = '09:00',
      workingHoursEnd = '17:00',
      bufferMinutes = 15,
      searchDays = 7,
      startFromTime,
    } = globalPreferences;

    // Sort events by priority (higher priority first), then by preferred start time
    const sortedEvents = events
      .map((event, index) => ({ ...event, originalIndex: index }))
      .sort((a, b) => {
        const priorityA = a.priority || 5;
        const priorityB = b.priority || 5;
        if (priorityA !== priorityB) return priorityB - priorityA;

        if (a.preferredStartTime && b.preferredStartTime) {
          return (
            new Date(a.preferredStartTime).getTime() -
            new Date(b.preferredStartTime).getTime()
          );
        }
        if (a.preferredStartTime) return -1;
        if (b.preferredStartTime) return 1;
        return a.originalIndex - b.originalIndex;
      });

    const scheduledEvents: Array<{
      title: string;
      description: string;
      startAt: string;
      endAt: string;
      originalIndex: number;
      schedulingInfo: {
        wasPreferred: boolean;
        foundAlternative: boolean;
        priority: number;
      };
    }> = [];

    const failedEvents: Array<{
      title: string;
      reason: string;
      originalIndex: number;
    }> = [];

    // Helper function to check if a time slot conflicts with already scheduled events
    const hasConflictWithScheduled = (startTime: Date, endTime: Date) => {
      return scheduledEvents.some((scheduled) => {
        const scheduledStart = new Date(scheduled.startAt);
        const scheduledEnd = new Date(scheduled.endAt);
        return startTime < scheduledEnd && scheduledStart < endTime;
      });
    };

    // Helper function to find next available slot considering scheduled events
    const findNextAvailableSlot = async (
      durationMinutes: number,
      preferredStart?: string
    ): Promise<{ startAt: string; endAt: string } | null> => {
      // Ensure minimum duration
      if (durationMinutes <= 0) {
        durationMinutes = 30; // Default to 30 minutes for 0-duration events
      } else if (durationMinutes < 15) {
        durationMinutes = 15; // Minimum 15 minutes for very short events
      }
      const searchStart = preferredStart
        ? new Date(preferredStart)
        : startFromTime
          ? new Date(startFromTime)
          : new Date();

      if (searchStart <= new Date()) {
        searchStart.setHours(searchStart.getHours() + 1);
      }
      searchStart.setMinutes(0, 0, 0);

      const searchEnd = new Date(searchStart);
      searchEnd.setDate(searchEnd.getDate() + searchDays);

      // Get existing events from database
      const { data: existingEvents } = await supabase
        .from('workspace_calendar_events')
        .select('start_at, end_at')
        .eq('ws_id', '00000000-0000-0000-0000-000000000000')
        .gte('start_at', searchStart.toISOString())
        .lte('start_at', searchEnd.toISOString())
        .order('start_at', { ascending: true });

      const applyTimeToDate = (date: Date, timeString: string) => {
        const [hours, minutes] = timeString.split(':').map(Number);
        const result = new Date(date);
        result.setHours(hours, minutes, 0, 0);
        return result;
      };

      let currentTime = new Date(searchStart);

      while (currentTime < searchEnd) {
        const dayStart = applyTimeToDate(currentTime, workingHoursStart);
        const dayEnd = applyTimeToDate(currentTime, workingHoursEnd);

        if (currentTime < dayStart) {
          currentTime = dayStart;
          continue;
        }

        if (currentTime >= dayEnd) {
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime = applyTimeToDate(currentTime, workingHoursStart);
          continue;
        }

        const proposedEnd = new Date(
          currentTime.getTime() + (durationMinutes + bufferMinutes) * 60000
        );
        const actualEnd = new Date(
          currentTime.getTime() + durationMinutes * 60000
        );

        if (proposedEnd > dayEnd) {
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime = applyTimeToDate(currentTime, workingHoursStart);
          continue;
        }

        // Check against existing events
        const hasExistingConflict = existingEvents?.some((event) => {
          const eventStart = new Date(event.start_at);
          const eventEnd = new Date(event.end_at);
          return currentTime < eventEnd && eventStart < proposedEnd;
        });

        // Check against already scheduled events in this batch
        const hasScheduledConflict = hasConflictWithScheduled(
          currentTime,
          proposedEnd
        );

        if (!hasExistingConflict && !hasScheduledConflict) {
          return {
            startAt: currentTime.toISOString(),
            endAt: actualEnd.toISOString(),
          };
        }

        currentTime.setHours(currentTime.getHours() + 1);
      }

      return null;
    };

    // Schedule each event
    for (const event of sortedEvents) {
      try {
        let slot = null;
        let wasPreferred = false;
        let foundAlternative = false;

        // Try preferred time first if provided
        if (event.preferredStartTime) {
          const preferredStart = new Date(event.preferredStartTime);
          const preferredEnd = new Date(
            preferredStart.getTime() + event.durationMinutes * 60000
          );
          const extendedEnd = new Date(
            preferredStart.getTime() +
              (event.durationMinutes + bufferMinutes) * 60000
          );

          // Check if preferred time is available
          const { data: existingConflicts } = await supabase
            .from('workspace_calendar_events')
            .select('id')
            .eq('ws_id', '00000000-0000-0000-0000-000000000000')
            .lt('start_at', extendedEnd.toISOString())
            .gt('end_at', preferredStart.toISOString());

          const hasScheduledConflict = hasConflictWithScheduled(
            preferredStart,
            extendedEnd
          );

          if (!existingConflicts?.length && !hasScheduledConflict) {
            slot = {
              startAt: preferredStart.toISOString(),
              endAt: preferredEnd.toISOString(),
            };
            wasPreferred = true;
          }
        }

        // If preferred time not available, find next available slot
        if (!slot) {
          slot = await findNextAvailableSlot(
            event.durationMinutes,
            event.preferredStartTime
          );
          foundAlternative = !wasPreferred && !!slot;
        }

        if (slot) {
          scheduledEvents.push({
            title: event.title,
            description: event.description,
            startAt: slot.startAt,
            endAt: slot.endAt,
            originalIndex: event.originalIndex,
            schedulingInfo: {
              wasPreferred,
              foundAlternative,
              priority: event.priority || 5,
            },
          });
        } else {
          failedEvents.push({
            title: event.title,
            reason: `No available slot found for ${event.durationMinutes} minutes in the next ${searchDays} days`,
            originalIndex: event.originalIndex,
          });
        }
      } catch (error) {
        failedEvents.push({
          title: event.title,
          reason: `Error scheduling event: ${error}`,
          originalIndex: event.originalIndex,
        });
      }
    }

    // If we have events to schedule, add them to the calendar
    if (scheduledEvents.length > 0) {
      const eventsToInsert = scheduledEvents.map((event) => ({
        title: event.title,
        description: event.description,
        start_at: event.startAt,
        end_at: event.endAt,
        ws_id: '00000000-0000-0000-0000-000000000000',
      }));

      const { data: insertedEvents, error } = await supabase
        .from('workspace_calendar_events')
        .insert(eventsToInsert)
        .select();

      if (error) {
        throw new Error(`Failed to insert scheduled events: ${error.message}`);
      }

      return {
        scheduledEvents: scheduledEvents.map((event) => ({
          ...event,
          id: insertedEvents?.[scheduledEvents.indexOf(event)]?.id,
        })),
        failedEvents,
        summary: {
          totalRequested: events.length,
          successfullyScheduled: scheduledEvents.length,
          failed: failedEvents.length,
          preferredTimeHonored: scheduledEvents.filter(
            (e) => e.schedulingInfo.wasPreferred
          ).length,
          alternativeTimeUsed: scheduledEvents.filter(
            (e) => e.schedulingInfo.foundAlternative
          ).length,
        },
        message: `Successfully scheduled ${scheduledEvents.length}/${events.length} events. ${failedEvents.length > 0 ? `${failedEvents.length} events could not be scheduled.` : 'All events scheduled successfully!'}`,
      };
    }

    return {
      scheduledEvents: [],
      failedEvents,
      summary: {
        totalRequested: events.length,
        successfullyScheduled: 0,
        failed: failedEvents.length,
        preferredTimeHonored: 0,
        alternativeTimeUsed: 0,
      },
      message: `Failed to schedule any events. ${failedEvents.length} events could not be scheduled.`,
    };
  },
});

export const rescheduleConflictingEvents = tool({
  description:
    'Intelligently reschedule existing events that have conflicts while preserving all their original data (colors, IDs, metadata)',
  parameters: z.object({
    timeRange: z
      .object({
        startDate: z
          .string()
          .describe('Start date to check for conflicts (ISO string)'),
        endDate: z
          .string()
          .describe('End date to check for conflicts (ISO string)'),
      })
      .optional()
      .describe(
        'Time range to check for conflicts (if not provided, checks current week)'
      ),
    rescheduleOptions: z
      .object({
        workingHoursStart: z
          .string()
          .optional()
          .describe('Start of working hours in HH:MM format (default: 09:00)'),
        workingHoursEnd: z
          .string()
          .optional()
          .describe('End of working hours in HH:MM format (default: 17:00)'),
        bufferMinutes: z
          .number()
          .optional()
          .describe('Buffer time between events in minutes (default: 15)'),
        searchDays: z
          .number()
          .optional()
          .describe(
            'Number of days to search ahead for new slots (default: 7)'
          ),
        priorityStrategy: z
          .enum(['creation_time', 'start_time', 'title_length'])
          .optional()
          .describe(
            'How to prioritize which events to move first (default: creation_time)'
          ),
      })
      .optional()
      .describe('Options for rescheduling'),
  }),
  execute: async ({ timeRange, rescheduleOptions = {} }) => {
    const supabase = await createClient();

    const {
      workingHoursStart = '09:00',
      workingHoursEnd = '17:00',
      bufferMinutes = 15,
      searchDays = 7,
      priorityStrategy = 'creation_time',
    } = rescheduleOptions;

    // Determine time range to check
    const startDate = timeRange?.startDate || new Date().toISOString();
    const endDate =
      timeRange?.endDate ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all events in the time range
    const { data: allEvents, error: fetchError } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', '00000000-0000-0000-0000-000000000000')
      .gte('start_at', startDate)
      .lte('end_at', endDate)
      .order('start_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch events: ${fetchError.message}`);
    }

    if (!allEvents || allEvents.length === 0) {
      return {
        conflictingEvents: [],
        rescheduledEvents: [],
        summary: {
          totalEvents: 0,
          conflictsFound: 0,
          successfullyRescheduled: 0,
          failedToReschedule: 0,
        },
        message: 'No events found in the specified time range',
      };
    }

    // Find conflicting events
    const conflictingEventPairs: Array<{
      event1: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
      };
      event2: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
      };
    }> = [];
    const conflictingEventIds = new Set<string>();

    for (let i = 0; i < allEvents.length; i++) {
      for (let j = i + 1; j < allEvents.length; j++) {
        const event1 = allEvents[i];
        const event2 = allEvents[j];

        const start1 = new Date(event1.start_at);
        const end1 = new Date(event1.end_at);
        const start2 = new Date(event2.start_at);
        const end2 = new Date(event2.end_at);

        // Check for overlap: startA < endB AND startB < endA
        if (start1 < end2 && start2 < end1) {
          conflictingEventPairs.push({ event1, event2 });
          conflictingEventIds.add(event1.id);
          conflictingEventIds.add(event2.id);
        }
      }
    }

    if (conflictingEventIds.size === 0) {
      return {
        conflictingEvents: [],
        rescheduledEvents: [],
        summary: {
          totalEvents: allEvents.length,
          conflictsFound: 0,
          successfullyRescheduled: 0,
          failedToReschedule: 0,
        },
        message: `Checked ${allEvents.length} events - no conflicts found`,
      };
    }

    // Get events that need rescheduling and sort them by priority strategy
    const eventsToReschedule = allEvents.filter((event) =>
      conflictingEventIds.has(event.id)
    );

    eventsToReschedule.sort((a, b) => {
      switch (priorityStrategy) {
        case 'start_time':
          return (
            new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
          ); // Later events get moved first
        case 'title_length':
          return a.title.length - b.title.length; // Shorter titles get moved first
        case 'creation_time':
        default:
          return (
            new Date(b.created_at || b.start_at).getTime() -
            new Date(a.created_at || a.start_at).getTime()
          ); // Newer events get moved first
      }
    });

    const rescheduledEvents: Array<{
      originalEvent: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
      };
      newStartAt: string;
      newEndAt: string;
      reschedulingInfo: {
        originalStartAt: string;
        originalEndAt: string;
        reason: string;
      };
    }> = [];

    const failedToReschedule: Array<{
      event: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
      };
      reason: string;
    }> = [];

    // Helper function to check conflicts with already rescheduled events
    const hasConflictWithRescheduled = (
      startTime: Date,
      endTime: Date,
      excludeEventId: string
    ) => {
      return rescheduledEvents.some((rescheduled) => {
        if (rescheduled.originalEvent.id === excludeEventId) return false;
        const rescheduledStart = new Date(rescheduled.newStartAt);
        const rescheduledEnd = new Date(rescheduled.newEndAt);
        return startTime < rescheduledEnd && rescheduledStart < endTime;
      });
    };

    // Helper function to find available slot for rescheduling
    const findAvailableSlotForReschedule = async (event: {
      id: string;
      title: string;
      start_at: string;
      end_at: string;
    }): Promise<{ startAt: string; endAt: string } | null> => {
      const eventDuration =
        new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
      let durationMinutes = eventDuration / (1000 * 60);

      // Ensure minimum duration of 30 minutes for events with 0 or very short duration
      if (durationMinutes <= 0) {
        durationMinutes = 30; // Default to 30 minutes for 0-duration events
      } else if (durationMinutes < 15) {
        durationMinutes = 15; // Minimum 15 minutes for very short events
      }

      const searchStart = new Date();
      searchStart.setHours(searchStart.getHours() + 1, 0, 0, 0);
      const searchEnd = new Date(searchStart);
      searchEnd.setDate(searchEnd.getDate() + searchDays);

      const applyTimeToDate = (date: Date, timeString: string) => {
        const [hours, minutes] = timeString.split(':').map(Number);
        const result = new Date(date);
        result.setHours(hours, minutes, 0, 0);
        return result;
      };

      let currentTime = new Date(searchStart);

      while (currentTime < searchEnd) {
        const dayStart = applyTimeToDate(currentTime, workingHoursStart);
        const dayEnd = applyTimeToDate(currentTime, workingHoursEnd);

        if (currentTime < dayStart) {
          currentTime = dayStart;
          continue;
        }

        if (currentTime >= dayEnd) {
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime = applyTimeToDate(currentTime, workingHoursStart);
          continue;
        }

        const proposedEnd = new Date(
          currentTime.getTime() + (durationMinutes + bufferMinutes) * 60000
        );
        const actualEnd = new Date(currentTime.getTime() + durationMinutes);

        if (proposedEnd > dayEnd) {
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime = applyTimeToDate(currentTime, workingHoursStart);
          continue;
        }

        // Check against all existing events (except the one being rescheduled)
        const hasExistingConflict = allEvents.some((existingEvent) => {
          if (existingEvent.id === event.id) return false; // Skip the event being rescheduled

          const existingStart = new Date(existingEvent.start_at);
          const existingEnd = new Date(existingEvent.end_at);
          return currentTime < existingEnd && existingStart < proposedEnd;
        });

        // Check against already rescheduled events
        const hasRescheduledConflict = hasConflictWithRescheduled(
          currentTime,
          proposedEnd,
          event.id
        );

        if (!hasExistingConflict && !hasRescheduledConflict) {
          return {
            startAt: currentTime.toISOString(),
            endAt: actualEnd.toISOString(),
          };
        }

        currentTime.setHours(currentTime.getHours() + 1);
      }

      return null;
    };

    // Reschedule each conflicting event
    for (const event of eventsToReschedule) {
      try {
        const newSlot = await findAvailableSlotForReschedule(event);

        if (newSlot) {
          rescheduledEvents.push({
            originalEvent: event,
            newStartAt: newSlot.startAt,
            newEndAt: newSlot.endAt,
            reschedulingInfo: {
              originalStartAt: event.start_at,
              originalEndAt: event.end_at,
              reason: `Moved to resolve scheduling conflict`,
            },
          });
        } else {
          failedToReschedule.push({
            event,
            reason: `No available slot found for ${Math.round((new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / (1000 * 60))} minutes in the next ${searchDays} days`,
          });
        }
      } catch (error) {
        failedToReschedule.push({
          event,
          reason: `Error finding new slot: ${error}`,
        });
      }
    }

    // Apply the rescheduling to the database
    if (rescheduledEvents.length > 0) {
      const updatePromises = rescheduledEvents.map(async (rescheduled) => {
        const { data, error } = await supabase
          .from('workspace_calendar_events')
          .update({
            start_at: rescheduled.newStartAt,
            end_at: rescheduled.newEndAt,
          })
          .eq('id', rescheduled.originalEvent.id)
          .select();

        return {
          eventId: rescheduled.originalEvent.id,
          data,
          error,
          rescheduled: rescheduled,
        };
      });

      const updateResults = await Promise.all(updatePromises);
      const successfulUpdates = updateResults.filter((result) => !result.error);
      const failedUpdates = updateResults.filter((result) => result.error);

      // Add any database update failures to the failed list
      failedUpdates.forEach((failed) => {
        const rescheduled = failed.rescheduled;
        failedToReschedule.push({
          event: rescheduled.originalEvent,
          reason: `Database update failed: ${failed.error?.message}`,
        });
      });

      return {
        conflictingEvents: conflictingEventPairs,
        rescheduledEvents: successfulUpdates.map(
          (update) => update.rescheduled
        ),
        failedToReschedule,
        summary: {
          totalEvents: allEvents.length,
          conflictsFound: conflictingEventPairs.length,
          successfullyRescheduled: successfulUpdates.length,
          failedToReschedule: failedToReschedule.length,
        },
        message: `Found ${conflictingEventPairs.length} conflicts. Successfully rescheduled ${successfulUpdates.length} events, ${failedToReschedule.length} failed to reschedule.`,
      };
    }

    return {
      conflictingEvents: conflictingEventPairs,
      rescheduledEvents: [],
      failedToReschedule,
      summary: {
        totalEvents: allEvents.length,
        conflictsFound: conflictingEventPairs.length,
        successfullyRescheduled: 0,
        failedToReschedule: failedToReschedule.length,
      },
      message: `Found ${conflictingEventPairs.length} conflicts but could not reschedule any events.`,
    };
  },
});

export const fixZeroDurationEvents = tool({
  description:
    'Find and fix events with 0 duration or very short durations by updating their end times while preserving all other data',
  parameters: z.object({
    timeRange: z
      .object({
        startDate: z
          .string()
          .describe('Start date to check for 0-duration events (ISO string)'),
        endDate: z
          .string()
          .describe('End date to check for 0-duration events (ISO string)'),
      })
      .optional()
      .describe(
        'Time range to check (if not provided, checks current week and next week)'
      ),
    durationOptions: z
      .object({
        defaultDurationMinutes: z
          .number()
          .optional()
          .describe(
            'Default duration for 0-duration events (default: 30 minutes)'
          ),
        minimumDurationMinutes: z
          .number()
          .optional()
          .describe(
            'Minimum duration for very short events (default: 15 minutes)'
          ),
        checkAllEvents: z
          .boolean()
          .optional()
          .describe(
            'Whether to check all events or only 0-duration ones (default: false - only 0-duration)'
          ),
      })
      .optional()
      .describe('Options for duration fixing'),
  }),
  execute: async ({ timeRange, durationOptions = {} }) => {
    const supabase = await createClient();

    const {
      defaultDurationMinutes = 30,
      minimumDurationMinutes = 15,
      checkAllEvents = false,
    } = durationOptions;

    // Determine time range to check (default: current week + next week)
    const startDate = timeRange?.startDate || new Date().toISOString();
    const defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 14); // 2 weeks ahead
    const endDate = timeRange?.endDate || defaultEndDate.toISOString();

    // Get all events in the time range
    const { data: allEvents, error: fetchError } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', '00000000-0000-0000-0000-000000000000')
      .gte('start_at', startDate)
      .lte('start_at', endDate)
      .order('start_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch events: ${fetchError.message}`);
    }

    if (!allEvents || allEvents.length === 0) {
      return {
        checkedEvents: [],
        fixedEvents: [],
        summary: {
          totalEvents: 0,
          zeroDurationFound: 0,
          shortDurationFound: 0,
          successfullyFixed: 0,
          failedToFix: 0,
        },
        message: 'No events found in the specified time range',
      };
    }

    // Find events with problematic durations
    const problematicEvents: Array<{
      event: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
      };
      issue: 'zero_duration' | 'short_duration';
      currentDurationMinutes: number;
      suggestedDurationMinutes: number;
    }> = [];

    allEvents.forEach((event) => {
      const eventDuration =
        new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
      const durationMinutes = eventDuration / (1000 * 60);

      if (durationMinutes <= 0) {
        problematicEvents.push({
          event,
          issue: 'zero_duration',
          currentDurationMinutes: durationMinutes,
          suggestedDurationMinutes: defaultDurationMinutes,
        });
      } else if (
        checkAllEvents &&
        durationMinutes > 0 &&
        durationMinutes < minimumDurationMinutes
      ) {
        problematicEvents.push({
          event,
          issue: 'short_duration',
          currentDurationMinutes: durationMinutes,
          suggestedDurationMinutes: minimumDurationMinutes,
        });
      }
    });

    if (problematicEvents.length === 0) {
      const zeroDurationCount = allEvents.filter((event) => {
        const duration =
          new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
        return duration <= 0;
      }).length;

      return {
        checkedEvents: allEvents,
        fixedEvents: [],
        summary: {
          totalEvents: allEvents.length,
          zeroDurationFound: zeroDurationCount,
          shortDurationFound: 0,
          successfullyFixed: 0,
          failedToFix: 0,
        },
        message: `Checked ${allEvents.length} events - no duration issues found${!checkAllEvents ? ' (only checked for 0-duration events)' : ''}`,
      };
    }

    // Fix the problematic events
    const fixedEvents: Array<{
      originalEvent: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
      };
      newEndAt: string;
      fixInfo: {
        originalDurationMinutes: number;
        newDurationMinutes: number;
        issue: string;
        reason: string;
      };
    }> = [];

    const failedToFix: Array<{
      event: {
        id: string;
        title: string;
        start_at: string;
        end_at: string;
      };
      reason: string;
    }> = [];

    // Helper function to check if the new end time would conflict with other events
    const wouldConflictWithOthers = (
      eventId: string,
      startAt: string,
      newEndAt: string
    ) => {
      const newStart = new Date(startAt);
      const newEnd = new Date(newEndAt);

      return allEvents.some((otherEvent) => {
        if (otherEvent.id === eventId) return false; // Skip the event being fixed

        const otherStart = new Date(otherEvent.start_at);
        const otherEnd = new Date(otherEvent.end_at);

        // Check if new end time would create overlap
        return newStart < otherEnd && otherStart < newEnd;
      });
    };

    for (const problematicEvent of problematicEvents) {
      try {
        const {
          event,
          suggestedDurationMinutes,
          currentDurationMinutes,
          issue,
        } = problematicEvent;
        const startTime = new Date(event.start_at);
        const newEndTime = new Date(
          startTime.getTime() + suggestedDurationMinutes * 60 * 1000
        );

        // Check if extending the duration would conflict with other events
        const wouldConflict = wouldConflictWithOthers(
          event.id,
          event.start_at,
          newEndTime.toISOString()
        );

        if (wouldConflict) {
          failedToFix.push({
            event,
            reason: `Extending duration to ${suggestedDurationMinutes} minutes would conflict with other events`,
          });
          continue;
        }

        // Update the event's end time
        const { error } = await supabase
          .from('workspace_calendar_events')
          .update({
            end_at: newEndTime.toISOString(),
          })
          .eq('id', event.id)
          .select();

        if (error) {
          failedToFix.push({
            event,
            reason: `Database update failed: ${error.message}`,
          });
        } else {
          fixedEvents.push({
            originalEvent: event,
            newEndAt: newEndTime.toISOString(),
            fixInfo: {
              originalDurationMinutes: currentDurationMinutes,
              newDurationMinutes: suggestedDurationMinutes,
              issue:
                issue === 'zero_duration'
                  ? 'Zero duration event'
                  : 'Very short duration event',
              reason: `Extended ${issue === 'zero_duration' ? '0-duration' : 'short'} event to ${suggestedDurationMinutes} minutes`,
            },
          });
        }
      } catch (error) {
        failedToFix.push({
          event: problematicEvent.event,
          reason: `Error fixing event: ${error}`,
        });
      }
    }

    const zeroDurationCount = problematicEvents.filter(
      (p) => p.issue === 'zero_duration'
    ).length;
    const shortDurationCount = problematicEvents.filter(
      (p) => p.issue === 'short_duration'
    ).length;

    return {
      checkedEvents: allEvents,
      fixedEvents,
      failedToFix,
      summary: {
        totalEvents: allEvents.length,
        zeroDurationFound: zeroDurationCount,
        shortDurationFound: shortDurationCount,
        successfullyFixed: fixedEvents.length,
        failedToFix: failedToFix.length,
      },
      message: `Checked ${allEvents.length} events. Found ${zeroDurationCount} zero-duration and ${shortDurationCount} short-duration events. Successfully fixed ${fixedEvents.length}, failed to fix ${failedToFix.length}.`,
    };
  },
});
