export const getIntensity = (duration: number): number => {
  if (duration === 0) return 0;
  if (duration < 1800) return 1;
  if (duration < 3600) return 2;
  if (duration < 7200) return 3;
  return 4;
};

export const getColorClass = (intensity: number): string => {
  const colors = [
    'bg-gray-100 dark:bg-gray-800/50',
    'bg-emerald-200 dark:bg-emerald-900/60',
    'bg-emerald-400 dark:bg-emerald-700/70',
    'bg-emerald-600 dark:bg-emerald-600/80',
    'bg-emerald-800 dark:bg-emerald-400/90',
  ];
  return colors[Math.max(0, Math.min(4, intensity))] ?? colors[0]!;
};
