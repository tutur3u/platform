import '@tanstack/react-start/server-only';
import { runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import { createIntlServer } from '@tuturuuu/start-bridge/intl/server';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

export const { getLocale, getMessages, getTranslations } = createIntlServer(
  { en, vi },
  {
    get basePath() {
      return runtimeAppBase();
    },
  }
);
