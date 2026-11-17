import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import {
  addSenderBlock,
  listSenderBlocks,
} from '@/lib/mail/sender-blocks/store';

type RouteParams = { mailboxId: string; wsId: string };

const noStore = { 'Cache-Control': 'private, no-store' };

const addSenderBlockSchema = z
  .object({
    kind: z.enum(['address', 'domain']),
    value: z.string().trim().min(3).max(320),
    moveExisting: z.boolean().default(true),
  })
  .strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const blocks = await listSenderBlocks({ ctx, mailboxId });
    if (!blocks)
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: noStore }
      );
    return NextResponse.json({ blocks }, { headers: noStore });
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, addSenderBlockSchema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const result = await addSenderBlock({ ctx, mailboxId, ...body.data });
    switch (result.status) {
      case 'forbidden':
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403, headers: noStore }
        );
      case 'invalid':
        return NextResponse.json(
          { error: 'Invalid sender block' },
          { status: 400, headers: noStore }
        );
      case 'limit':
        return NextResponse.json(
          { error: 'Too many sender blocks' },
          { status: 409, headers: noStore }
        );
      default:
        return NextResponse.json(
          { block: result.block, moved: result.moved },
          { headers: noStore }
        );
    }
  });
}
