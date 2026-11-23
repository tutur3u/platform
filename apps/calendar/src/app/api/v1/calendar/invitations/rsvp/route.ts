import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection } from 'next/server';
import { handleRsvp } from '@/lib/calendar/invitations/public-routes';

// Public: a signed, expiring, RSVP-only token from an invitation email.
export async function GET(request: Request) {
  await connection();
  return handleRsvp(request, createAdminClient);
}

export async function POST(request: Request) {
  return handleRsvp(request, createAdminClient);
}
