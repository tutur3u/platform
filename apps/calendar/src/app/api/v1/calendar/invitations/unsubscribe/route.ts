import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { connection } from 'next/server';
import { handleUnsubscribe } from '@/lib/calendar/invitations/public-routes';

async function adminClient(): Promise<TypedSupabaseClient> {
  return (await createAdminClient({ noCookie: true })) as TypedSupabaseClient;
}

// Public: a signed, expiring, unsubscribe-only token from an invitation email.
export async function GET(request: Request) {
  await connection();
  return handleUnsubscribe(request, adminClient);
}

export async function POST(request: Request) {
  return handleUnsubscribe(request, adminClient);
}
