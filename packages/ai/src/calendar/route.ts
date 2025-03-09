import { calendarEventSchema } from './events';
import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { streamObject } from 'ai';

export async function POST(req: Request) {
  const context = (await req.json()) as {
    prompt: string;
    current_time: string;
    smart_scheduling?: boolean;
    existing_events?: Array<{
      start_at: string;
      end_at: string;
      title?: string;
      priority?: string;
    }>;
  };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email?.endsWith('@tuturuuu.com'))
    return new Response('Unauthorized', { status: 401 });

  // Extract timezone information from context if available
  const userTimezone = extractTimezone(context.prompt);

  // Extract priority information from the prompt
  const priority = extractPriority(context.prompt) || 'medium';

  // Build the prompt based on whether smart scheduling is enabled
  let promptText =
    `Current time: ${context.current_time}. ` +
    `Generate a calendar event with the provided information with proper capitalization. Create start_at and end_at in ISO format that works with JavaScript's new Date(). ` +
    `Use local time in the user's timezone (${userTimezone}). ` +
    `Set the priority field to "${priority}" for this event. `;

  // Add smart scheduling context if enabled
  if (
    context.smart_scheduling &&
    context.existing_events &&
    context.existing_events.length > 0
  ) {
    promptText +=
      `\nIMPORTANT: This is a smart scheduling request. You need to schedule this event so it doesn't overlap with any existing events. ` +
      `Here are the existing events (in ISO format):\n`;

    // Sort events by start time for better analysis
    const sortedEvents = [...context.existing_events].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

    sortedEvents.forEach((event, index) => {
      const startDate = new Date(event.start_at);
      const endDate = new Date(event.end_at);
      promptText +=
        `Event ${index + 1}: ${event.title || 'Untitled'}, ` +
        `Start: ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: userTimezone })} ` +
        `on ${startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: userTimezone })}, ` +
        `End: ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: userTimezone })}` +
        `${event.priority ? `, Priority: ${event.priority}` : ''}\n`;
    });

    promptText +=
      `\nPlease analyze these existing events and schedule the new event at a time that doesn't conflict with any of them. ` +
      `Follow these guidelines for smart scheduling:\n` +
      `1. If the requested time in the prompt would cause an overlap, find the nearest available time slot that fits the event duration.\n` +
      `2. Prefer to schedule events during normal working hours (9am-5pm) when possible, unless specifically requested otherwise.\n` +
      `3. For meetings, prefer to schedule them at common meeting start times (on the hour or half-hour).\n` +
      `4. If the event needs to be moved to a different day, try to keep it as close as possible to the originally requested day.\n` +
      `5. In your scheduling_note field, explain clearly why you chose this time slot if it differs from what was requested in the prompt.\n` +
      `6. If multiple time slots are available, choose the one that's most convenient based on the existing schedule (e.g., adjacent to other events to minimize fragmentation).\n` +
      `7. Consider the priority of this event (${priority}) when scheduling. Higher priority events should be scheduled closer to the requested time, even if it means suggesting a shorter duration.\n` +
      `8. If this is a high priority event and there's a conflict with a lower priority event, suggest rescheduling the lower priority event instead.\n`;
  }

  promptText += `\nContext: ${context.prompt}`;

  const result = streamObject({
    model: google('gemini-2.0-flash'),
    schema: calendarEventSchema,
    prompt: promptText,
  });

  return result.toTextStreamResponse();
}

// Helper function to extract timezone information from the context
function extractTimezone(context: string): string {
  // Default to UTC if no timezone found
  let timezone = 'UTC';

  try {
    // Look for the timezone pattern in the context
    const timezoneMatch = context.match(/User timezone:\s*([^)]+)/i);
    if (timezoneMatch && timezoneMatch[1]) {
      timezone = timezoneMatch[1].trim();
    }
  } catch (error) {
    console.error('Error extracting timezone:', error);
  }

  return timezone;
}

// Helper function to extract priority information from the context
function extractPriority(context: string): string | null {
  try {
    // Look for the priority pattern in the context
    const priorityMatch = context.match(/Priority:\s*(low|medium|high)/i);
    if (priorityMatch && priorityMatch[1]) {
      return priorityMatch[1].toLowerCase().trim();
    }
  } catch (error) {
    console.error('Error extracting priority:', error);
  }

  return null;
}
