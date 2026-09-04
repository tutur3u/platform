import { Suspense } from 'react';
import { NavCta, PrimaryLandingCta, SessionAwareCta } from './session-cta';

/**
 * Suspense-wrapped CTA slots.
 *
 * Each slot prerenders its signed-out variant and swaps to the signed-in one
 * once the session resolves. Kept in one file so every call site on the page
 * uses the same boundary shape — a mismatched fallback would flash different
 * copy on hydration.
 */

export function NavCtaSlot() {
  return (
    <Suspense fallback={<NavCta authed={false} />}>
      <SessionAwareCta
        signedIn={<NavCta authed />}
        signedOut={<NavCta authed={false} />}
      />
    </Suspense>
  );
}

export function PrimaryCtaSlot() {
  return (
    <Suspense fallback={<PrimaryLandingCta authed={false} />}>
      <SessionAwareCta
        signedIn={<PrimaryLandingCta authed />}
        signedOut={<PrimaryLandingCta authed={false} />}
      />
    </Suspense>
  );
}
