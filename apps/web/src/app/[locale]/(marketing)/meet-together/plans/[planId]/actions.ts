'use server';

import { createAdminClient } from '@ncthub/supabase/next/server';
import { generateSalt, hashPassword } from '@ncthub/utils/crypto';

export async function guestLogin(
  rawPlanId: string,
  name: string,
  password: string
) {
  // rawPlanId is an uuid without dashes,
  // we'll have to add them back to make it a valid uuid
  const planId = rawPlanId.replace(
    /^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/,
    '$1-$2-$3-$4-$5'
  );

  // if planId isn't a valid uuid
  if (planId.length !== 36) {
    throw new Error('Invalid request');
  }

  if (!name) throw new Error('Invalid request');

  const sbAdmin = await createAdminClient();

  // Fetch guest by name and planId
  const { data: guest, error } = await sbAdmin
    .from('meet_together_guests')
    .select('id, name, password_hash, password_salt')
    .eq('plan_id', planId)
    .eq('name', name)
    .maybeSingle();

  if (error) {
    console.log(error);
    throw new Error('Error while fetching guest');
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
      throw new Error('Error while creating guest');
    }

    return {
      user: {
        id: guest.id,
        display_name: guest.name,
        password_hash: hashedPassword,
        planId,
        is_guest: true,
      },
      message: 'Created new guest',
    };
  }

  // If guest exists, check password
  const hashedPassword = await hashPassword(password, guest.password_salt);
  if (hashedPassword === guest.password_hash)
    return {
      user: {
        id: guest.id,
        display_name: guest.name,
        password_hash: hashedPassword,
        planId,
        is_guest: true,
      },
      message: 'Logged in',
    };

  throw new Error('Invalid credentials');
}
