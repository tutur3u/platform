'use client';

import { useTranslations } from 'next-intl';

export default function AccountBadge({ type }: { type: 'GUEST' | 'PLATFORM' }) {
  const t = useTranslations('meet-together-plan-details');

  return (
    <div
      className={`${
        type === 'GUEST'
          ? 'border border-foreground/20 bg-foreground/10'
          : 'bg-linear-to-r from-pink-500/80 to-sky-600/80 dark:from-pink-300/70 dark:to-blue-300/70'
      } mt-2 rounded px-2 py-1 text-sm font-semibold`}
    >
      <span className={`bg-linear-to-r bg-clip-text text-white`}>
        {t(type === 'GUEST' ? 'guest_account' : 'tuturuuu_account')}
      </span>
    </div>
  );
}
