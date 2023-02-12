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
import { CalendarProvider } from '../../hooks/useCalendar';
import { ProjectProvider } from '../../hooks/useProjects';
import { WalletProvider } from '../../hooks/useWallets';

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
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={initialSession}
    >
      <SWRConfig
        value={{
          fetcher: (resource, init) =>
            fetch(resource, init).then((res) => res.json()),
        }}
      >
        <CalendarProvider>
          <UserDataProvider>
            <MantineProvider
              theme={{
                colorScheme: 'dark',
              }}
            >
              <UserListProvider>
                <AppearanceProvider>
                  <ModalsProvider>
                    <NotificationsProvider position="bottom-left">
                      <OrganizationProvider>
                        <ProjectProvider>
                          <WalletProvider>{children}</WalletProvider>
                        </ProjectProvider>
                      </OrganizationProvider>
                    </NotificationsProvider>
                  </ModalsProvider>
                </AppearanceProvider>
              </UserListProvider>
            </MantineProvider>
          </UserDataProvider>
        </CalendarProvider>
      </SWRConfig>
    </SessionContextProvider>
  );
};

export default Providers;
