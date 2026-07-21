export const SUPPORT_EMAIL = 'support@tuturuuu.com';

export const densityClasses = {
  airy: {
    cardPadding: 'p-8 sm:p-12',
    sectionGap: 'space-y-20',
    questionGap: 'space-y-16',
  },
  balanced: {
    cardPadding: 'p-6 sm:p-10',
    sectionGap: 'space-y-16',
    questionGap: 'space-y-12',
  },
  compact: {
    cardPadding: 'p-5 sm:p-8',
    sectionGap: 'space-y-12',
    questionGap: 'space-y-10',
  },
} as const;

export const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4)
    .toString()
    .padStart(2, '0');
  const minute = ['00', '15', '30', '45'][index % 4] ?? '00';

  return `${hour}:${minute}`;
});

export type FormDensityClasses =
  (typeof densityClasses)[keyof typeof densityClasses];
