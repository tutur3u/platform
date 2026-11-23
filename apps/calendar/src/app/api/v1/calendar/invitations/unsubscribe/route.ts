import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection } from 'next/server';
import { handleUnsubscribe } from '@/lib/calendar/invitations/public-routes';

// Public: a signed, expiring, unsubscribe-only token from an invitation email.
export async function GET(request: Request) {
  await connection();
  return handleUnsubscribe(request, createAdminClient);
}

export async function POST(request: Request) {
  return handleUnsubscribe(request, createAdminClient);
}
