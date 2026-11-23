'use client';

import { useSyncExternalStore } from 'react';
import { browserMountedAppBase } from '@tuturuuu/utils/shared-cookie';
import {
  DEFAULT_LOCALE_COOKIE_NAME,
  DEFAULT_SUPPORTED_LOCALES,
  readLocalePreference,
} from './locale-preference';

const subscribe = () => () => {};

/**
 * The browser's stored locale preference: a supported locale, `null` for the
 * system language, or `undefined` while rendering on the server, where callers
 * fall back to the value their server component passed.
 */
export function useLocalePreference(
  locales: readonly string[] = DEFAULT_SUPPORTED_LOCALES
): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () =>
      readLocalePreference(
        document.cookie,
        locales,
        DEFAULT_LOCALE_COOKIE_NAME,
        browserMountedAppBase() ? 'first' : 'last'
      ),
    () => undefined
  );
}
