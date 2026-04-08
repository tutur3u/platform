import { createAdminClient } from '@ncthub/supabase/next/server';
import { generateSalt, hashPassword } from '@ncthub/utils/crypto';
import { NextResponse } from 'next/server';
import z from 'zod';
import { GUEST_LIMIT } from '@/constants/meet-together';

const GuestLoginInputSchema = z.object({
  planId: z.string().uuid(),
  name: z.string(),
  password: z.string(),
});

interface Params {
  params: Promise<{
    planId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const { planId: rawPlanId } = await params;
  const { name: rawName, password: rawPassword } = await req.json();

  const result = GuestLoginInputSchema.safeParse({
    planId: rawPlanId,
    name: rawName,
    password: rawPassword,
  });

  if (!result.success) {
    throw new Error('Invalid request');
  }

  const { planId, name, password } = result.data;

  const sbAdmin = await createAdminClient();

  const { count: guestCount, error: guestCountError } = await sbAdmin
    .from('meet_together_guests')
    .select('*', { count: 'exact', head: true })
    .eq('plan_id', planId);

  if (guestCountError) {
    console.log(guestCountError);
    return NextResponse.json(
      { message: 'Error while counting guests' },
      { status: 500 }
    );
  }

  if (guestCount && guestCount > GUEST_LIMIT) {
    return NextResponse.json(
      { message: 'Guest limit reached' },
      { status: 403 }
    );
  }

  // Fetch guest by name and planId
  const { data: guest, error } = await sbAdmin
    .from('meet_together_guests')
    .select('id, name, password_hash, password_salt')
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
    const salt = generateSalt();
    const hashedPassword = await hashPassword(password, salt);

    const { data: guest, error } = await sbAdmin
      .from('meet_together_guests')
      .insert({
        name,
        plan_id: planId,
        password_hash: hashedPassword,
        password_salt: salt,
      })
      .select('id, name')
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
        id: guest.id,
        display_name: guest.name,
        password_hash: hashedPassword,
        planId,
        is_guest: true,
      },
      message: 'Created new guest',
    });
  }

  // If guest exists, check password
  const hashedPassword = await hashPassword(password, guest.password_salt);
  if (hashedPassword === guest.password_hash)
    return NextResponse.json({
      user: {
        id: guest.id,
        display_name: guest.name,
        password_hash: hashedPassword,
        planId,
        is_guest: true,
      },
      message: 'Logged in',
    });

  return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
}
