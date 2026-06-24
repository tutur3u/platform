export type TranslationMessages = Record<string, unknown>;

export type TranslationStatus = 'complete' | 'missing-en' | 'missing-vi';

export type TranslationStatusFilter = 'all' | TranslationStatus;

export type FlatTranslation = {
  enValue: string | null;
  key: string;
  namespace: string;
  status: TranslationStatus;
  viValue: string | null;
};

export type TranslationFilters = {
  namespace: string;
  query: string;
  status: TranslationStatusFilter;
};

export type TranslationStats = {
  complete: number;
  missingEn: number;
  missingVi: number;
  total: number;
};
