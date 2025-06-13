import { useTheme } from 'next-themes';

export default function AssistantGradientName() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <span
      className={`${
        isDark
          ? 'from-pink-300 via-amber-300 to-blue-300'
          : 'from-pink-500 via-yellow-500 to-sky-600 dark:from-pink-300 dark:via-amber-300 dark:to-blue-300'
      } bg-linear-to-r bg-clip-text font-bold text-transparent`}
    >
      Mira AI
    </span>
  );
}
