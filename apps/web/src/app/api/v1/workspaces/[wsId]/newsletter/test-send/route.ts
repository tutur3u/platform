import { connection } from 'next/server';
import { z } from 'zod';
import {
  newsletterErrorResponse,
  newsletterJson,
  readJson,
  requireNewsletterManager,
} from '@/lib/newsletter/http';
import { sendNewsletterStaffTest } from '@/lib/newsletter/service';

const bodySchema = z
  .object({
    localPart: z.string().max(32),
    subject: z.string().max(200),
    text: z.string().max(8000),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const access = await requireNewsletterManager(request, wsId);
  if (!access.ok) return access.response;
  const actorEmail = access.user.email;
  if (typeof actorEmail !== 'string' || actorEmail.length === 0) {
    return newsletterJson({ error: 'recipient_not_actor' }, 403);
  }
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return newsletterJson({ error: 'invalid_request' }, 400);
  try {
    const result = await sendNewsletterStaffTest({
      actorEmail,
      actorId: access.user.id,
      localPart: parsed.data.localPart,
      subject: parsed.data.subject,
      text: parsed.data.text,
      wsId: access.wsId,
    });
    return newsletterJson(result);
  } catch (error) {
    return newsletterErrorResponse(error);
  }
}
