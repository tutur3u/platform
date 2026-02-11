'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateSalt, hashPassword } from '@tuturuuu/utils/crypto';

export interface GuestLoginInput {
  name: string;
  password: string;
}

export interface GuestUser {
  id: string;
  display_name: string;
  password_hash: string;
  planId: string;
  is_guest: true;
}

export async function guestLogin(rawPlanId: string, input: GuestLoginInput) {
  // rawPlanId is a uuid without dashes, add them back
  const planId = rawPlanId.replace(
    /^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/,
    '$1-$2-$3-$4-$5'
  );

  // Validate UUID format
  if (planId.length !== 36) {
    return { error: 'Invalid request' };
  }

  const sbAdmin = await createAdminClient();

  const { name, password } = input;

  if (!name) {
    return { error: 'Invalid request' };
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
    return { error: 'Error while fetching guest' };
  }

  // If guest does not exist, create a new one
  if (!guest?.name) {
    const salt = generateSalt();
    const hashedPassword = await hashPassword(password, salt);

    const { data: newGuest, error: createError } = await sbAdmin
      .from('meet_together_guests')
      .insert({
        name,
        plan_id: planId,
        password_hash: hashedPassword,
        password_salt: salt,
      })
      .select('id, name')
      .single();

    if (createError) {
      console.log(createError);
      return { error: 'Error while creating guest' };
    }

    return {
      data: {
        user: {
          id: newGuest.id,
          display_name: newGuest.name,
          password_hash: hashedPassword,
          planId,
          is_guest: true as const,
        },
        message: 'Created new guest',
      },
    };
  }

  // If guest exists, check password
  const hashedPassword = await hashPassword(password, guest.password_salt);
  if (hashedPassword === guest.password_hash) {
    return {
      data: {
        user: {
          id: guest.id,
          display_name: guest.name,
          password_hash: hashedPassword,
          planId,
          is_guest: true as const,
        },
        message: 'Logged in',
      },
    };
  }

  return { error: 'Invalid credentials' };
}
