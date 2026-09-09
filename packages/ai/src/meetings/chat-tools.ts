import { tool } from 'ai';
import { z } from 'zod';
import { createGoogleSearchToolSet } from '../tools/google-search-tool';

export interface MeetAssistantContext {
  title: string;
  observedAt: string;
  timezone: string;
  participantCount: number;
  deviceCount: number;
  participants: Array<{ displayName: string; role: string }>;
}

export function meetAssistantTools(context: MeetAssistantContext) {
  return {
    ...createGoogleSearchToolSet(),
    get_current_time: tool({
      description:
        'Get the current date, weekday and time. Use an IANA timezone when the user asks about another location; default to the requester timezone.',
      inputSchema: z.object({ timezone: z.string().max(100).optional() }),
      execute: async ({ timezone }) => {
        const zone = timezone ?? context.timezone;
        try {
          const now = new Date();
          return {
            utc: now.toISOString(),
            timezone: zone,
            local: new Intl.DateTimeFormat('en-US', {
              timeZone: zone,
              dateStyle: 'full',
              timeStyle: 'long',
            }).format(now),
          };
        } catch {
          return {
            error:
              'Invalid IANA timezone. Ask for the location or use the requester timezone.',
          };
        }
      },
    }),
    get_meeting_context: tool({
      description:
        'Get this meeting title, admitted participants, distinct person count and device count at the time of the question. Multiple devices belonging to one account count as one person. Does not include waiting or offline approved people.',
      inputSchema: z.object({}),
      execute: async () => context,
    }),
  };
}
