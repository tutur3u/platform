import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  AUTH_CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
} from '@/i18n/client-messages';

/** The welcome flow adds its own copy and the avatar editor's labels. */
const ONBOARDING_CLIENT_MESSAGE_PATHS = [
  ...AUTH_CLIENT_MESSAGE_NAMESPACES,
  'onboarding_flow',
  'settings-account.avatar',
  'settings-account.avatar-description',
  'settings-account.avatar_compression_error',
  'settings-account.avatar_remove_error',
  'settings-account.avatar_removed',
  'settings-account.avatar_update_error',
  'settings-account.avatar_updated',
  'settings-account.crop_avatar',
  'settings-account.crop_failed_description',
  'settings-account.new_avatar',
  'settings-account.remove_avatar',
  'settings-account.save_avatar',
  'settings-account.upload_avatar',
] as const;

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const messages = getClientMessages(
    await getMessages(),
    ONBOARDING_CLIENT_MESSAGE_PATHS
  );

  // The (auth) layout above already scopes the Sorbet design to this route.
  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
