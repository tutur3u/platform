import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  meetShortLinkErrorResponse,
  resolveMeetShortLinkContext,
} from '@/lib/meet-short-links/request-context';
import {
  deleteMeetShortLink,
  updateVanityMeetShortLink,
} from '@/lib/meet-short-links/service';

type Params = {
  params: Promise<{ wsId: string; meetingId: string; linkId: string }>;
};

const UpdateBody = z.object({
  slug: z.string().max(64),
  prefixed: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const resolved = await resolveMeetShortLinkContext(request, params);
  if (!resolved.ok) return resolved.response;
  const { linkId } = await params;
  const body = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    return NextResponse.json({
      link: await updateVanityMeetShortLink(resolved.ctx, linkId, body.data),
    });
  } catch (error) {
    return meetShortLinkErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const resolved = await resolveMeetShortLinkContext(request, params);
  if (!resolved.ok) return resolved.response;
  const { linkId } = await params;
  try {
    await deleteMeetShortLink(resolved.ctx, linkId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return meetShortLinkErrorResponse(error);
  }
}
