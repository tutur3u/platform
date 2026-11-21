import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  meetShortLinkErrorResponse,
  resolveMeetShortLinkContext,
} from '@/lib/meet-short-links/request-context';
import {
  createVanityMeetShortLink,
  ensureGeneratedMeetShortLink,
  listMeetShortLinks,
} from '@/lib/meet-short-links/service';

type Params = { params: Promise<{ wsId: string; meetingId: string }> };

const CreateBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('generated'), prefixed: z.boolean().optional() }),
  z.object({
    kind: z.literal('vanity'),
    slug: z.string().max(64),
    prefixed: z.boolean().optional(),
  }),
]);

export async function GET(request: NextRequest, { params }: Params) {
  const resolved = await resolveMeetShortLinkContext(request, params);
  if (!resolved.ok) return resolved.response;
  try {
    return NextResponse.json(await listMeetShortLinks(resolved.ctx), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return meetShortLinkErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveMeetShortLinkContext(request, params);
  if (!resolved.ok) return resolved.response;
  const body = CreateBody.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const link =
      body.data.kind === 'generated'
        ? await ensureGeneratedMeetShortLink(resolved.ctx, {
            prefixed: body.data.prefixed,
          })
        : await createVanityMeetShortLink(resolved.ctx, {
            slug: body.data.slug,
            prefixed: body.data.prefixed,
          });
    return NextResponse.json({ link });
  } catch (error) {
    return meetShortLinkErrorResponse(error);
  }
}
