import { google } from '@ai-sdk/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { streamObject } from 'ai';
import { calendarEventsSchema } from './events';

export async function POST(req: Request) {
  const context = (await req.json()) as {
    prompt: string;
    current_time: string;
    existing_events?: Array<{
      start_at: string;
      end_at: string;
      title?: string;
      priority?: string;
    }>;
    categories?: Array<{
      name: string;
      color: string;
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

  // Add category color information if available
  if (context.categories && context.categories.length > 0) {
    promptText += `\nIMPORTANT: The user has defined the following event categories and associated colors:\n`;
    context.categories.forEach((category, index) => {
      promptText += `${index + 1}. ${category.name}: ${category.color}\n`;
    });
    promptText += `\nIt is CRITICAL that you analyze the event content and assign the MOST RELEVANT color based on the event category. DO NOT default to blue unless it truly matches.
    
For example:
- If creating a "Team Meeting" event and "Work" category is blue, use "blue"
- If creating a "Doctor Appointment" event and "Health" category is red, use "red"
- If creating a "Family Dinner" event and "Family" category is purple, use "purple"
- If creating a "Gym" event and "Personal" category is green, use "green"
`;
  }

  promptText += `\nContext: ${context.prompt}`;

  const result = streamObject({
    model: google('gemini-2.0-flash'),
    schema: calendarEventsSchema,
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
    if (timezoneMatch?.[1]) {
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
    if (priorityMatch?.[1]) {
      return priorityMatch[1].toLowerCase().trim();
    }
  } catch (error) {
    console.error('Error extracting priority:', error);
  }

  return null;
}
