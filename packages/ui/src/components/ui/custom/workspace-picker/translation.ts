import type { useTranslations } from 'next-intl';

export type PickerTranslator = ReturnType<typeof useTranslations<'common'>>;
