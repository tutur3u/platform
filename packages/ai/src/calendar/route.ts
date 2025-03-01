import { calendarEventSchema } from './events';
import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { streamObject } from 'ai';

export async function POST(req: Request) {
  const context = (await req.json()) as {
    prompt: string;
    current_time: string;
  };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email?.endsWith('@tuturuuu.com'))
    return new Response('Unauthorized', { status: 401 });

  // Extract timezone information from context if available
  const userTimezone = extractTimezone(context.prompt);

  const result = streamObject({
    model: google('gemini-2.0-flash'),
    schema: calendarEventSchema,
    prompt:
      `Current time: ${context.current_time}. ` +
      `Generate a calendar event with the provided information with proper capitalization. Create start_at and end_at in ISO format that works with JavaScript's new Date(). ` +
      `Use local time in the user's timezone (${userTimezone}). ` +
      `Context: ${context.prompt}`,
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
