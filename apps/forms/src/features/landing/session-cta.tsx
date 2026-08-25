import { ArrowRight } from '@tuturuuu/icons';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { MarketingNavAction, PrimaryCta } from '@tuturuuu/ui/marketing';
import { connection } from 'next/server';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * Session-aware calls to action.
 *
 * Only the CTA copy and target depend on whether the visitor is signed in — the
 * rest of the landing page is identical either way. Reading the session at the
 * page root would force the whole marketing page to render per request, so the
 * check is isolated here: the page prerenders as static HTML and each CTA
 * streams in behind its own `<Suspense>` boundary.
 *
 * Both variants are built synchronously by the caller and handed in as nodes.
 * A `<Suspense>` fallback must not itself suspend, so the signed-out button
 * cannot be an async component — and it is the right fallback anyway, being
 * both the common case and what a crawler should see in the prerendered HTML.
 */
export async function SessionAwareCta({
  signedIn,
  signedOut,
}: {
  signedIn: ReactNode;
  signedOut: ReactNode;
}) {
  // Scoped to this boundary on purpose. The Supabase session helper reads the
  // clock internally, which `cacheComponents` refuses to prerender; opting just
  // the CTA into request-time rendering keeps the surrounding marketing page
  // static instead of dragging the whole route dynamic.
  await connection();

  const appSession = await getSatelliteAppSession('forms');

  return appSession ? signedIn : signedOut;
}

export const LANDING_WORKSPACE_HREF = '/dashboard';
export const LANDING_LOGIN_HREF = '/login?next=/dashboard';

/** The nav's action button, in either session state. */
export function NavCta({ authed }: { authed: boolean }) {
  const t = useTranslations('forms.landing.nav');

  return (
    <MarketingNavAction
      href={authed ? LANDING_WORKSPACE_HREF : LANDING_LOGIN_HREF}
      label={authed ? t('workspace') : t('get_started')}
    />
  );
}

/** The hero and closing sections' primary button, in either session state. */
export function PrimaryLandingCta({ authed }: { authed: boolean }) {
  const t = useTranslations('forms.landing.hero');

  return (
    <PrimaryCta
      accent="purple"
      href={authed ? LANDING_WORKSPACE_HREF : LANDING_LOGIN_HREF}
    >
      {authed ? t('primary_authed') : t('primary')}
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </PrimaryCta>
  );
}
