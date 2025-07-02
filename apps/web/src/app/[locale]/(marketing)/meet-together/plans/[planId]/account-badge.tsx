import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

export default function AccountBadge({ type }: { type: 'GUEST' | 'PLATFORM' }) {
  const t = useTranslations('meet-together-plan-details');

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <div
      className={`${
        type === 'GUEST'
          ? 'border border-foreground/20 bg-foreground/10'
          : isDark
            ? 'bg-linear-to-r from-pink-300/70 to-blue-300/70'
            : 'bg-linear-to-r from-pink-500/80 to-sky-600/80 dark:from-pink-300/70 dark:to-blue-300/70'
      } mt-2 rounded px-2 py-1 font-semibold text-sm`}
    >
      <span
        className={`bg-linear-to-r bg-clip-text text-transparent text-white`}
      >
        {t(type === 'GUEST' ? 'guest_account' : 'tuturuuu_account')}
      </span>
    </div>
  );
}
