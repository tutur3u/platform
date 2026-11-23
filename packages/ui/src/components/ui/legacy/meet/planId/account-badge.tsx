'use client';

import { useTranslations } from 'next-intl';

/** Marks a guest identity; a Tuturuuu account is the default and carries no badge. */
export default function AccountBadge({ type }: { type: 'GUEST' | 'PLATFORM' }) {
  const t = useTranslations('meet-together-plan-details');
  if (type !== 'GUEST') return null;

  return (
    <div className="mt-2 rounded border border-foreground/20 bg-foreground/10 px-2 py-1 font-semibold text-sm">
      {t('guest_account')}
    </div>
  );
}
