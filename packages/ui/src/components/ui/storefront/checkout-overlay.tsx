'use client';

import { Loader2 } from '@tuturuuu/icons';

/**
 * Full-screen blocking overlay shown while a checkout session is being created
 * and while the browser is redirecting to the Polar-hosted checkout. Kept
 * visible across the redirect (the page is navigating away) so the buyer always
 * sees progress instead of a frozen button.
 */
export function StorefrontCheckoutOverlay({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="assertive"
      className="fixed inset-0 z-[100] grid place-items-center bg-background/80 backdrop-blur-sm"
      role="status"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-[var(--storefront-accent,var(--primary))]/10 text-[var(--storefront-accent,var(--primary))]">
          <Loader2 className="size-7 animate-spin" />
        </span>
        <p className="font-medium text-sm">{label}</p>
      </div>
    </div>
  );
}
