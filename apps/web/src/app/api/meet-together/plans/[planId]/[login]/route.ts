import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/client';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    planId: string;
  };
}

export async function POST(req: Request, { params: { planId } }: Params) {
  const sbAdmin = createAdminClient();
  if (!sbAdmin) {
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  const { name, password } = await req.json();

  if (!name || !password) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }

  const hashedPassword = crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password)
  );

  console.log(hashedPassword);

  const { data: guest, error } = await sbAdmin
    .from('meet_together_guests')
    .select('id, name, password_hash, password_salt')
    .eq('plan_id', planId)
    .eq('name', 'name')
    .maybeSingle();

  console.log(guest, error);

  // TODO: check if guest exists and password is correct
  // TODO: throw error when guest already exists and password is incorrect

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
