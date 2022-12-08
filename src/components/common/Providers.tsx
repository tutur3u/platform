import {
  Session,
  SessionContextProvider,
  SupabaseClient,
} from '@supabase/auth-helpers-react';

import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { NotificationsProvider } from '@mantine/notifications';
import { UserDataProvider } from '../../hooks/useUserData';
import { AppearanceProvider } from '../../hooks/useAppearance';
import { OrganizationProvider } from '../../hooks/useOrganizations';
import { SWRConfig } from 'swr';
import { UserListProvider } from '../../hooks/useUserList';

interface ProvidersProps {
  supabaseClient: SupabaseClient;
  initialSession: Session;
  children: React.ReactNode;
}

const Providers = ({
  supabaseClient,
  initialSession,
  children,
}: ProvidersProps) => {
  return (
    <SWRConfig
      value={{
        fetcher: (resource, init) =>
          fetch(resource, init).then((res) => res.json()),
      }}
    >
      <SessionContextProvider
        supabaseClient={supabaseClient}
        initialSession={initialSession}
      >
        <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          theme={{
            colorScheme: 'dark',
          }}
        >
          <SessionContextProvider supabaseClient={supabaseClient}>
            <UserListProvider>
              <UserDataProvider>
                <AppearanceProvider>
                  <ModalsProvider>
                    <NotificationsProvider position="bottom-left">
                      <OrganizationProvider>{children}</OrganizationProvider>
                    </NotificationsProvider>
                  </ModalsProvider>
                </AppearanceProvider>
              </UserDataProvider>
            </UserListProvider>
          </SessionContextProvider>
        </MantineProvider>
      </SessionContextProvider>
    </SWRConfig>
  );
};

export default Providers;
