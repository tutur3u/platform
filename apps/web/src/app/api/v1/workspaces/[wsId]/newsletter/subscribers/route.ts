import { connection } from 'next/server';
import { z } from 'zod';
import {
  newsletterErrorResponse,
  newsletterJson,
  readJson,
  requireNewsletterManager,
} from '@/lib/newsletter/http';
import { addNewsletterSubscriber } from '@/lib/newsletter/service';

const bodySchema = z.object({ email: z.string().max(320) }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const access = await requireNewsletterManager(request, wsId);
  if (!access.ok) return access.response;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return newsletterJson({ error: 'invalid_request' }, 400);
  try {
    const result = await addNewsletterSubscriber({
      actorId: access.user.id,
      email: parsed.data.email,
      wsId: access.wsId,
    });
    if (!result.created) return newsletterJson({ created: false });
    return newsletterJson({ created: true, token: result.token }, 201);
  } catch (error) {
    return newsletterErrorResponse(error);
  }
}
