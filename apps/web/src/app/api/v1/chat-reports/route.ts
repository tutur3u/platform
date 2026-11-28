import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  resolveStaffActor,
  StaffReadError,
} from '@/app/api/v1/product-feedback/staff-access';
import {
  callPrivateChatRpc,
  chatRpcErrorResponse,
} from '@/lib/chat/private-rpc';

const headers = { 'Cache-Control': 'private, no-store' };

const statusSchema = z.enum(['open', 'reviewing', 'actioned', 'dismissed']);

const reviewSchema = z
  .object({
    reportId: z.guid(),
    status: z.enum(['reviewing', 'actioned', 'dismissed']),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

const failureMessages = {
  401: 'Unauthorized',
  403: 'Forbidden',
  503: 'Unavailable',
} as const;

function staffFailure(status: keyof typeof failureMessages) {
  return {
    ok: false as const,
    response: NextResponse.json(
      { message: failureMessages[status] },
      { status, headers }
    ),
  };
}

// The queue follows the staff inbox switch, like the product-feedback staff
// pages and routes.
async function staffActor(request: Request) {
  if (process.env.PRODUCT_FEEDBACK_STAFF_INBOX_ENABLED !== 'true')
    return staffFailure(503);
  try {
    return { ok: true as const, actorId: await resolveStaffActor(request) };
  } catch (error) {
    return staffFailure(error instanceof StaffReadError ? error.status : 503);
  }
}

// The SQL re-checks the canonical staff registry on every call.
function staffRpcError(error: unknown) {
  const code = (error as { code?: string }).code;
  if (code === 'PT403') {
    return NextResponse.json(
      { message: 'Forbidden' },
      { status: 403, headers }
    );
  }
  if (code === 'PT503') {
    return NextResponse.json(
      { message: 'Unavailable' },
      { status: 503, headers }
    );
  }
  return null;
}

// Staff moderation queue for chat and Mira reports. Only verified Tuturuuu
// staff (the product-feedback staff gate) can read reported content.
export async function GET(request: Request) {
  const staff = await staffActor(request);
  if (!staff.ok) return staff.response;

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status');
  const status = rawStatus ? statusSchema.safeParse(rawStatus) : null;
  if (status && !status.success) {
    return NextResponse.json(
      { message: 'Invalid status' },
      { status: 400, headers }
    );
  }
  const limit = Number(url.searchParams.get('limit') ?? 50);

  try {
    const reports = await callPrivateChatRpc<unknown[]>(
      'chat_list_content_reports',
      {
        p_actor_user_id: staff.actorId,
        p_limit: Number.isFinite(limit) ? limit : 50,
        p_status: status?.data ?? null,
      }
    );
    return NextResponse.json({ reports: reports ?? [] }, { headers });
  } catch (error) {
    return (
      staffRpcError(error) ??
      chatRpcErrorResponse(error, 'Failed to load reports')
    );
  }
}

export async function PATCH(request: Request) {
  const staff = await staffActor(request);
  if (!staff.ok) return staff.response;

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400, headers }
    );
  }

  try {
    const result = await callPrivateChatRpc('chat_review_content_report', {
      p_note: parsed.data.note ?? null,
      p_report_id: parsed.data.reportId,
      p_reviewer_user_id: staff.actorId,
      p_status: parsed.data.status,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return (
      staffRpcError(error) ??
      chatRpcErrorResponse(error, 'Failed to update report')
    );
  }
}
