import {
  issueMobileClientCredentialForSession,
  mobileClientSessionBinding,
  readSupabaseSessionId,
} from './mobile-client-credential';

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFIED = 'native-login';

type MobileSession = { userId: string; sessionId: string };

function key({ userId, sessionId }: MobileSession) {
  return `mastermind:verified-mobile-session:v1:${mobileClientSessionBinding(
    JSON.stringify([userId, sessionId])
  )}`;
}

async function ownerStore(userId: string) {
  // The normal sign-in path does no store I/O outside the owner allowlist.
  if (
    !process.env.MASTERMIND_FLEET_OWNER_IDS &&
    !process.env.MASTERMIND_PUSH_OWNER_IDS
  )
    return null;
  const [{ fleetOwnerIds }, { getMastermindStore }] = await Promise.all([
    import('@/lib/mastermind/fleet/auth'),
    import('@/lib/mastermind/store'),
  ]);
  return fleetOwnerIds().includes(userId.toLowerCase())
    ? getMastermindStore()
    : null;
}

/** This writer is called only for a new verified Mobile password or OTP session. */
export async function issueCredentialAfterMobileLogin(
  session: { access_token: string },
  user: { id: string } | null | undefined
) {
  const sessionId =
    user && readSupabaseSessionId(session.access_token, user.id);
  let mastermindSession = false;
  if (user && sessionId) {
    try {
      const store = await ownerStore(user.id);
      if (store) {
        mastermindSession = await store.set(
          key({ userId: user.id, sessionId }),
          VERIFIED,
          { ttlMs: TTL_MS }
        );
      }
    } catch {
      // Preserve normal sign-in. No recorded proof means no privileged scope.
    }
  }
  return issueMobileClientCredentialForSession(
    session,
    user,
    mastermindSession
  );
}

/** Can renew a recorded session but can never enroll a new session. */
export async function refreshMastermindMobileSession(session: MobileSession) {
  try {
    const store = await ownerStore(session.userId);
    return (
      (await store?.compareAndSet(key(session), VERIFIED, VERIFIED, TTL_MS)) ===
      true
    );
  } catch {
    return false;
  }
}
