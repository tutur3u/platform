import '@tanstack/react-start/server-only';
import { createIntlServer } from '@tuturuuu/start-bridge/intl/server';
import { runtimeAppBase } from '@tuturuuu/start-bridge/start/base-path';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

const intl = () => createIntlServer({ en, vi }, { basePath: runtimeAppBase() });
export const getLocale = () => intl().getLocale();
export const getMessages = (
  ...args: Parameters<ReturnType<typeof createIntlServer>['getMessages']>
) => intl().getMessages(...args);
export const getTranslations = (
  ...args: Parameters<ReturnType<typeof createIntlServer>['getTranslations']>
) => intl().getTranslations(...args);
