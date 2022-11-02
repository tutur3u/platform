import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { NotificationsProvider } from '@mantine/notifications';
import { useState } from 'react';
import { UserDataProvider } from '../../hooks/useUserData';
import { AppearanceProvider } from '../../hooks/useAppearance';
import { OrganizationProvider } from '../../hooks/useOrganizations';
import { SWRConfig } from 'swr';

interface ProvidersProps {
  children: React.ReactNode;
}

const Providers = ({ children }: ProvidersProps) => {
  const [supabaseClient] = useState(() => createBrowserSupabaseClient());

  return (
    <SWRConfig
      value={{
        fetcher: (resource, init) =>
          fetch(resource, init).then((res) => res.json()),
      }}
    >
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
                  <OrganizationProvider>{children}</OrganizationProvider>
                </NotificationsProvider>
              </ModalsProvider>
            </AppearanceProvider>
          </UserDataProvider>
        </SessionContextProvider>
      </MantineProvider>
    </SWRConfig>
  );
};

export default Providers;
