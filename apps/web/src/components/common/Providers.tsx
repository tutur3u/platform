import {
  Session,
  SessionContextProvider,
  SupabaseClient,
} from '@supabase/auth-helpers-react';

import { UserDataProvider } from '../../hooks/useUserData';
import { AppearanceProvider } from '../../hooks/useAppearance';
import { WorkspaceProvider } from '../../hooks/useWorkspaces';
import { SWRConfig } from 'swr';
import { UserListProvider } from '../../hooks/useUserList';
import { CalendarProvider } from '../../hooks/useCalendar';
import { ProjectProvider } from '../../hooks/useProjects';
import { WalletProvider } from '../../hooks/useWallets';
import { TransactionProvider } from '../../hooks/useTransactions';
import MantineProvider from '../mantine/MantineProvider';

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
            <MantineProvider>
              <UserListProvider>
                <AppearanceProvider>
                  <WorkspaceProvider>
                    <ProjectProvider>
                      <WalletProvider>
                        <TransactionProvider>{children}</TransactionProvider>
                      </WalletProvider>
                    </ProjectProvider>
                  </WorkspaceProvider>
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
