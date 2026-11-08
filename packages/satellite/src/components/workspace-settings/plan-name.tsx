'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

const PLAN_NAME_KEYS: Record<string, string> = {
  ENTERPRISE: 'billing_plan_enterprise',
  FREE: 'billing_plan_free',
  PLUS: 'billing_plan_plus',
  PRO: 'billing_plan_pro',
};

export function PlanName({ tier }: { tier: string }) {
  const t = useTranslations('satellite-workspace-settings');
  const key = PLAN_NAME_KEYS[tier];
  // The tier code and its translated name are the same fact. Show it once.
  return <Badge variant="secondary">{key ? t(key) : tier}</Badge>;
}
