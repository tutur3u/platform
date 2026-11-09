import { z } from 'zod';
import {
  newsletterErrorResponse,
  newsletterJson,
  readJson,
  requireNewsletterManager,
} from '@/lib/newsletter/http';
import {
  createNewsletterClaim,
  readNewsletterClaim,
} from '@/lib/newsletter/service';

const bodySchema = z.object({ subdomain: z.string().max(253) }).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireNewsletterManager(request, wsId);
  if (!access.ok) return access.response;
  try {
    const result = await readNewsletterClaim(access.wsId);
    return newsletterJson(result);
  } catch (error) {
    return newsletterErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireNewsletterManager(request, wsId);
  if (!access.ok) return access.response;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return newsletterJson({ error: 'invalid_request' }, 400);
  try {
    const created = await createNewsletterClaim({
      actorId: access.user.id,
      subdomain: parsed.data.subdomain,
      wsId: access.wsId,
    });
    return newsletterJson(
      {
        approval: created.approval,
        dnsRecords: created.dnsRecords,
        subdomain: created.subdomain,
        token: created.token,
        txtVerified: created.txtVerified,
      },
      201
    );
  } catch (error) {
    return newsletterErrorResponse(error);
  }
}
