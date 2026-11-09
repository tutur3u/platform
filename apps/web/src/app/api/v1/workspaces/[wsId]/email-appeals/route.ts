import { z } from 'zod';
import { hasDeliverableMx } from '@/lib/email-appeals/deliverability';
import { AppealError, appealRequestSchema } from '@/lib/email-appeals/domain';
import {
  appealErrorResponse,
  appealJson,
  readAppealJson,
  requireAppealAdmin,
} from '@/lib/email-appeals/http';
import { getAppealMailer } from '@/lib/email-appeals/mailer';
import { requestAppeal } from '@/lib/email-appeals/service';
import { createAppealStore, listAppeals } from '@/lib/email-appeals/store';

const querySchema = z.object({
  search: z.string().max(200).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const access = await requireAppealAdmin(request, wsId);
    if (!access.ok) return access.response;
    const url = new URL(request.url);
    const query = querySchema.safeParse({
      search: url.searchParams.get('search') ?? '',
      page: url.searchParams.get('page') ?? 1,
    });
    if (!query.success) throw new AppealError('invalid_request');
    return appealJson(await listAppeals({ ...access, ...query.data }));
  } catch (error) {
    return appealErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const body = appealRequestSchema.safeParse(await readAppealJson(request));
    if (!body.success) throw new AppealError('invalid_request');
    const access = await requireAppealAdmin(request, wsId);
    if (!access.ok) return access.response;
    return appealJson(
      await requestAppeal(
        { ...access, ...body.data },
        {
          store: await createAppealStore(access.actorId),
          key: process.env.EMAIL_APPEAL_TOKEN_SECRET ?? '',
          origin: new URL(request.url).origin,
          mailer: getAppealMailer(),
          checkMx: hasDeliverableMx,
        }
      )
    );
  } catch (error) {
    return appealErrorResponse(error);
  }
}
