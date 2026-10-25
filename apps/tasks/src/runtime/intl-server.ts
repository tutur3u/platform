import { createIntlServer } from '@tuturuuu/start-bridge/intl/server';
import { appBasePath } from '@tuturuuu/start-bridge/start/base-path';
import type { AbstractIntlMessages } from 'use-intl';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

/** `next-intl/server` for the native build, over Tasks' message bundles. */
export const { getLocale, getMessages, getTranslations } = createIntlServer(
  // Bundles hold string arrays, which `AbstractIntlMessages` does not model.
  {
    en: en as unknown as AbstractIntlMessages,
    vi: vi as unknown as AbstractIntlMessages,
  },
  { basePath: appBasePath() }
);
