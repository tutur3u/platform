import { z } from 'zod';
import { AppealError, appealRequestSchema } from '@/lib/email-appeals/domain';
import {
  appealErrorResponse,
  appealJson,
  readAppealJson,
  requireAppealAdmin,
} from '@/lib/email-appeals/http';
import { refreshAppealInventory } from '@/lib/email-appeals/inventory';
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
    const providerInventory = await refreshAppealInventory({
      ...access,
      ...query.data,
    });
    return appealJson({
      ...(await listAppeals({ ...access, ...query.data })),
      providerInventory,
    });
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
    await refreshAppealInventory({
      ...access,
      search: body.data.email,
      page: 1,
    });
    return appealJson(
      await requestAppeal(
        { ...access, ...body.data },
        {
          store: await createAppealStore(access.actorId),
        }
      )
    );
  } catch (error) {
    return appealErrorResponse(error);
  }
}
