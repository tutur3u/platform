import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { NotificationsProvider } from '@mantine/notifications';
import { useState } from 'react';
import { UserDataProvider } from '../../hooks/useUserData';
import { AppearanceProvider } from '../../hooks/useAppearance';

interface ProvidersProps {
  children: React.ReactNode;
}

const Providers = ({ children }: ProvidersProps) => {
  const [supabaseClient] = useState(() => createBrowserSupabaseClient());

  return (
    <MantineProvider
      withGlobalStyles
      withNormalizeCSS
      theme={{
        colorScheme: 'dark',
      }}
    >
      <SessionContextProvider supabaseClient={supabaseClient}>
        <UserDataProvider>
          <AppearanceProvider>
            <ModalsProvider>
              <NotificationsProvider position="bottom-left">
                {children}
              </NotificationsProvider>
            </ModalsProvider>
          </AppearanceProvider>
        </UserDataProvider>
      </SessionContextProvider>
    </MantineProvider>
  );
};

export default Providers;
