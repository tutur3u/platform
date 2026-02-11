'use client';

import { useTranslations } from 'next-intl';

export default function AccountBadge({ type }: { type: 'GUEST' | 'PLATFORM' }) {
  const t = useTranslations('meet-together-plan-details');

  return (
    <div
      className={`${
        type === 'GUEST'
          ? 'border border-foreground/20 bg-foreground/10'
          : 'bg-linear-to-r from-dynamic-red/70 to-dynamic-blue/70'
      } mt-2 rounded px-2 py-1 font-semibold text-sm`}
    >
      <span className={`bg-linear-to-r bg-clip-text text-white`}>
        {t(type === 'GUEST' ? 'guest_account' : 'tuturuuu_account')}
      </span>
    </div>
  );
}
