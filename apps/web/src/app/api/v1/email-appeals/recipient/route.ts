import { z } from 'zod';
import { hasDeliverableMx } from '@/lib/email-appeals/deliverability';
import { AppealError } from '@/lib/email-appeals/domain';
import { isEmailAppealsEnabled } from '@/lib/email-appeals/flag';
import {
  appealErrorResponse,
  appealJson,
  readAppealJson,
  requireAppealRecipient,
} from '@/lib/email-appeals/http';
import {
  bootstrapRecipientAppeal,
  readRecipientAppeal,
} from '@/lib/email-appeals/service';
import { createAppealStore } from '@/lib/email-appeals/store';
import { getAppealTransport } from '@/lib/email-appeals/transport';

const schema = z.object({ appealId: z.uuid() }).strict();

export async function GET(request: Request) {
  try {
    const parsed = schema.safeParse({
      appealId: new URL(request.url).searchParams.get('appealId'),
    });
    if (!parsed.success) throw new AppealError('invalid_request');
    const actor = await requireAppealRecipient(request);
    return appealJson(
      await readRecipientAppeal(
        { ...actor, ...parsed.data },
        {
          store: await createAppealStore(actor.actorId),
          isEnabled: isEmailAppealsEnabled,
        }
      )
    );
  } catch (error) {
    return appealErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readAppealJson(request));
    if (!parsed.success) throw new AppealError('invalid_request');
    const actor = await requireAppealRecipient(request);
    return appealJson(
      await bootstrapRecipientAppeal(
        { ...actor, ...parsed.data },
        {
          store: await createAppealStore(actor.actorId),
          key: process.env.EMAIL_APPEAL_TOKEN_SECRET ?? '',
          isEnabled: isEmailAppealsEnabled,
          getTransport: getAppealTransport,
          checkMx: hasDeliverableMx,
        }
      )
    );
  } catch (error) {
    return appealErrorResponse(error);
  }
}
