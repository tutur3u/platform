import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/client';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    planId: string;
  };
}

export async function POST(
  req: Request,
  { params: { planId: rawPlanId } }: Params
) {
  // rawPlanId is an uuid without dashes,
  // we'll have to add them back to make it a valid uuid
  const planId = rawPlanId.replace(
    /^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/,
    '$1-$2-$3-$4-$5'
  );

  // if planId isn't a valid uuid
  if (planId.length !== 36) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }

  const sbAdmin = createAdminClient();

  // if we can't initialize the admin client
  if (!sbAdmin) {
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  const { name, password } = await req.json();

  if (!name)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  // Fetch guest by name and planId
  const { data: guest, error } = await sbAdmin
    .from('meet_together_guests')
    .select('name, password_hash, password_salt')
    .eq('plan_id', planId)
    .eq('name', name)
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error while fetching guest' },
      { status: 500 }
    );
  }

  // If guest does not exist, create a new one
  if (!guest?.name) {
    const salt = Math.random().toString(36).substring(2, 15);
    const passwordWithSalt = password + salt;

    // use native crypto to hash the password
    const hashedPassword = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(passwordWithSalt)
    );

    const hashedPasswordStr = new Uint8Array(hashedPassword).join('');
    const hashedPasswordHex = parseInt(hashedPasswordStr)
      .toString(16)
      .replace(/0+$/, '');

    const { data, error } = await sbAdmin
      .from('meet_together_guests')
      .insert({
        name,
        plan_id: planId,
        password_hash: hashedPasswordHex,
        password_salt: salt,
      })
      .select('name')
      .single();

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error while creating guest' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        name: data.name,
        plan_id: planId,
      },
      message: 'Created new guest',
    });
  }

  // If guest exists, check password
  const passwordWithSalt = password + guest.password_salt;

  const hashedPassword = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(passwordWithSalt)
  );

  const hashedPasswordArray = new Uint8Array(hashedPassword).join('');
  const hashedPasswordHex = parseInt(hashedPasswordArray)
    .toString(16)
    .replace(/0+$/, '');

  console.log('hashedPassword', hashedPasswordHex);
  console.log('guest.password_hash', guest.password_hash);

  if (hashedPasswordHex === guest.password_hash)
    return NextResponse.json({
      user: {
        name: guest.name,
        plan_id: planId,
      },
      message: 'Logged in',
    });

  return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
}
