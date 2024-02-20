import { useTheme } from 'next-themes';
import useTranslation from 'next-translate/useTranslation';

export default function AccountBadge({ type }: { type: 'GUEST' | 'PLATFORM' }) {
  const { t } = useTranslation('meet-together-plan-details');

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <div
      className={`${
        type === 'GUEST'
          ? 'bg-foreground/10 border-foreground/20 border'
          : isDark
            ? 'bg-gradient-to-r from-pink-300/50 via-amber-300/50 to-blue-300/50'
            : 'bg-gradient-to-r from-pink-500/70 via-yellow-500/70 to-sky-600/70 dark:from-pink-300/50 dark:via-amber-300/50 dark:to-blue-300/50'
      } mt-2 rounded px-2 py-1 text-sm font-semibold`}
    >
      <span
        className={`bg-gradient-to-r bg-clip-text text-transparent text-white`}
      >
        {t(type === 'GUEST' ? 'guest_account' : 'tuturuuu_account')}
      </span>
    </div>
  );
}
