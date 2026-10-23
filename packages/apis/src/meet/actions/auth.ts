'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import {
  checkPasswordAttemptLimit,
  clearPasswordAttemptFailures,
  normalizePasswordAttemptName,
  type PasswordAttemptSubject,
  recordPasswordAttemptFailure,
} from '@tuturuuu/utils/abuse-protection/password-attempt-limits';
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  verifyPassword,
} from '@tuturuuu/utils/crypto';
import {
  createMeetGuestSession,
  normalizeMeetPlanId,
} from '@tuturuuu/utils/meet-guest-session';
import { headers } from 'next/headers';

export interface GuestLoginInput {
  name: string;
  password: string;
}

export interface GuestUser {
  id: string;
  display_name: string;
  /** Short-lived, plan-bound session issued after password verification. */
  guest_session: string;
  guest_session_expires_at: string;
  planId: string;
  is_guest: true;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

async function resolveClientIP() {
  try {
    return extractIPFromHeaders(await headers());
  } catch {
    return null;
  }
}

function guestUser(id: string, name: string, planId: string): GuestUser {
  const session = createMeetGuestSession({ guestId: id, planId });
  return {
    id,
    display_name: name,
    guest_session: session.token,
    guest_session_expires_at: session.expiresAt,
    planId,
    is_guest: true,
  };
}

export async function guestLogin(rawPlanId: string, input: GuestLoginInput) {
  // rawPlanId may be a uuid without dashes; normalise to the stored form.
  const planId = normalizeMeetPlanId(rawPlanId);

  if (!UUID_PATTERN.test(planId)) {
    return { error: 'Invalid request' };
  }

  const { name } = input;
  const password = input.password ?? '';

  if (
    !name ||
    typeof password !== 'string' ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return { error: 'Invalid request' };
  }

  const sbAdmin = await createAdminClient();

  // Fetch guest by name and planId
  const { data: guest, error } = await sbAdmin
    .from('meet_together_guests')
    .select('id, name, password_hash, password_salt')
    .eq('plan_id', planId)
    .eq('name', name)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch Meet guest', { message: error.message });
    return { error: 'Error while fetching guest' };
  }

  // If guest does not exist, create a new one
  if (!guest?.name) {
    const passwordHash = await hashPassword(password);

    const { data: newGuest, error: createError } = await sbAdmin
      .from('meet_together_guests')
      .insert({
        name,
        plan_id: planId,
        password_hash: passwordHash,
        // The scrypt encoding embeds its own salt.
        password_salt: '',
      })
      .select('id, name')
      .single();

    if (createError) {
      console.error('Failed to create Meet guest', {
        message: createError.message,
      });
      return { error: 'Error while creating guest' };
    }

    return {
      data: {
        user: guestUser(newGuest.id, newGuest.name, planId),
        message: 'Created new guest',
      },
    };
  }

  const attempt: PasswordAttemptSubject = {
    scope: 'meet-guest',
    target: `${planId}:${normalizePasswordAttemptName(name)}`,
    ip: await resolveClientIP(),
  };
  const limit = await checkPasswordAttemptLimit(attempt);
  if (!limit.allowed) {
    return {
      error: 'Too many failed attempts',
      retryAfter: limit.retryAfter ?? 60,
    };
  }

  const verification = await verifyPassword(password, {
    hash: guest.password_hash,
    salt: guest.password_salt,
  });

  if (!verification.valid) {
    await recordPasswordAttemptFailure(attempt);
    return { error: 'Invalid credentials' };
  }

  await clearPasswordAttemptFailures(attempt);

  if (verification.needsRehash) {
    // Upgrade legacy hashes in place. The filter on the old value keeps a
    // concurrent login from overwriting a hash another request already
    // upgraded; losing that race is harmless because both hashes verify.
    const { error: rehashError } = await sbAdmin
      .from('meet_together_guests')
      .update({
        password_hash: await hashPassword(password),
        password_salt: '',
      })
      .eq('id', guest.id)
      .eq('password_hash', guest.password_hash);

    if (rehashError) {
      console.warn('Failed to upgrade Meet guest password hash', {
        message: rehashError.message,
      });
    }
  }

  return {
    data: {
      user: guestUser(guest.id, guest.name, planId),
      message: 'Logged in',
    },
  };
}
