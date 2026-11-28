import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { requireMeetAiDataConsent } from '../../../../../features/call/server/ai-data-consent';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { z } from 'zod';

const timezone = z
  .string()
  .max(100)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  });

/**
 * The locale cookie (`LOCALE_COOKIE_NAME` in `@tuturuuu/satellite/constants`).
 * Named here so this handler stays free of the i18n routing that module loads.
 */
const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

/** The requester's UI locale from the locale cookie, when it is one Meet ships. */
function requesterLocale(request: Request) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === LOCALE_COOKIE_NAME && (value === 'en' || value === 'vi'))
      return value;
  }
  return undefined;
}

/**
 * Room chat @mira. Generation requires room Mira authority (eligible account,
 * attested meeting workspace) and the all-participant Continue fence.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const input = z
      .object({
        messageId: z.string().min(1).max(200),
        timezone: timezone.default('UTC'),
        workspaceId: z.uuid().optional(),
      })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid message');
    await requireMeetAiDataConsent(request, access.user.id);
    const { generateMeetAssistant } =
      await import('@tuturuuu/meet-core/features/call/server/assistant-generation');
    return generateMeetAssistant(access, {
      ...input.data,
      locale: requesterLocale(request),
    });
  });
}
