'use client';

import { InternalApiError } from '@tuturuuu/internal-api/client';
import { useTranslations } from 'next-intl';

export const domainsKey = (wsId: string) => ['workspace-domains', wsId];

/** Known API error codes have their own message; anything else is generic. */
export function useDomainErrorMessage() {
  const t = useTranslations('workspace-domains');
  return (error: Error | null) => {
    if (!error) return null;
    const code = error instanceof InternalApiError ? error.message : '';
    const known = [
      'hostname_invalid',
      'hostname_reserved',
      'hostname_unavailable',
      'entitlement_cap_reached',
      'entitlement_no_slots',
      'entitlement_kill_switch',
      'entitlement_paid_plan_required',
      'entitlement_billing_unavailable',
      'entitlement_addon_required',
      'entitlement_staff_session_unverified',
      'workspace_domains_forbidden',
    ] as const;
    const match = known.find((value) => value === code);
    return match ? t(`errors.${match}`) : t('errors.generic');
  };
}
