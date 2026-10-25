import '@tanstack/react-start/server-only';
import { createIntlServer } from '@tuturuuu/start-bridge/intl/server';
import { appBasePath } from '@tuturuuu/start-bridge/start/base-path';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

export const { getLocale, getMessages, getTranslations } = createIntlServer(
  { en, vi },
  { basePath: appBasePath() }
);
