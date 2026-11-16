'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import {
  buildCommandLauncherLabels,
  buildCommandLauncherLabelsFromMessages,
} from './command-launcher-labels';
import type { GlobalCommandLauncherProps } from './command-launcher-types';
import { GlobalCommandLauncher } from './global-command-launcher';

/**
 * Launcher for hosts rendered inside their next-intl provider. Labels come
 * from the shared `command_launcher` namespace; `labels` overrides win.
 */
export function IntlGlobalCommandLauncher({
  labels: overrides,
  ...props
}: GlobalCommandLauncherProps) {
  const launcher = useTranslations('command_launcher');
  const labels = useMemo(
    () => ({ ...buildCommandLauncherLabels({ launcher }), ...overrides }),
    [launcher, overrides]
  );
  return <GlobalCommandLauncher {...props} labels={labels} />;
}

type MessagesModule = { default: { command_launcher?: unknown } };

/**
 * Launcher for hosts that mount it above their intl provider. The locale
 * comes from the `[locale]` route segment and the app's own message bundle
 * loads with the dialog on first open.
 */
export function MessagesCommandLauncher({
  loadMessages,
  ...props
}: Omit<GlobalCommandLauncherProps, 'labelsLoader'> & {
  /** Module-level function so the loader identity stays stable. */
  loadMessages: (locale: 'en' | 'vi') => Promise<MessagesModule>;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale === 'vi' ? 'vi' : 'en';
  const labelsLoader = useCallback(
    () =>
      loadMessages(locale).then((module) =>
        buildCommandLauncherLabelsFromMessages(module.default.command_launcher)
      ),
    [loadMessages, locale]
  );
  return <GlobalCommandLauncher {...props} labelsLoader={labelsLoader} />;
}
