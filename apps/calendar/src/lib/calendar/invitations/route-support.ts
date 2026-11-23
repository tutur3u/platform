import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/common';
import { decryptEventFromStorage } from '@/lib/workspace-encryption';
import type { CalendarEventRow } from './context';
import { InvitationError } from './context';
import type { InvitationDeliveryDeps } from './delivery';
import type { InvitationLocale } from './email';
import { notifyEventGuests } from './guests';
import { sendInvitationEmail } from './sender';

export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export function invitationDeps(
  sbAdmin: TypedSupabaseClient,
  request: Request
): InvitationDeliveryDeps {
  const header = request.headers.get('accept-language') ?? '';
  const locale: InvitationLocale = /^\s*vi\b/i.test(header) ? 'vi' : 'en';
  return {
    sbAdmin,
    send: sendInvitationEmail,
    linkBase: BASE_URL,
    locale,
  };
}

export function eventDecryptor(wsId: string) {
  return (event: CalendarEventRow) => decryptEventFromStorage(event, wsId);
}

export function invitationErrorResponse(error: unknown, context: string) {
  if (error instanceof InvitationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: NO_STORE }
    );
  }
  console.error(`Calendar invitations: ${context} failed`, {
    code: (error as { code?: string } | null)?.code,
  });
  return NextResponse.json(
    { error: 'Failed to update guests' },
    { status: 500, headers: NO_STORE }
  );
}

/**
 * Before a Tuturuuu event is deleted, queue and send cancellations to its
 * invited guests. Deleting never fails because of email: queued rows keep a
 * snapshot, so a later dispatch can still deliver them.
 */
export async function cancelGuestInvitationsBeforeDelete(input: {
  sbAdmin: TypedSupabaseClient;
  request: Request;
  wsId: string;
  eventId: string;
  userId: string;
}) {
  try {
    await notifyEventGuests(invitationDeps(input.sbAdmin, input.request), {
      wsId: input.wsId,
      eventId: input.eventId,
      actorUserId: input.userId,
      kind: 'cancel',
      decrypt: eventDecryptor(input.wsId),
    });
  } catch (error) {
    console.error('Calendar invitations: cancellation before delete failed', {
      code: (error as { code?: string } | null)?.code,
    });
  }
}
