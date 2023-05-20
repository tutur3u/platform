import {
  Session,
  SessionContextProvider,
  SupabaseClient,
} from '@supabase/auth-helpers-react';

import { UserDataProvider } from '../../hooks/useUser';
import { AppearanceProvider } from '../../hooks/useAppearance';
import { WorkspaceProvider } from '../../hooks/useWorkspaces';
import { SWRConfig } from 'swr';
import { CalendarProvider } from '../../hooks/useCalendar';
import { WalletProvider } from '../../hooks/useWallets';
import { TransactionProvider } from '../../hooks/useTransactions';
import MantineProvider from '../mantine/MantineProvider';
import { SegmentProvider } from '../../hooks/useSegments';

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
        <UserDataProvider>
          <AppearanceProvider>
            <MantineProvider>
              <SegmentProvider>
                <WorkspaceProvider>
                  <CalendarProvider>
                    <WalletProvider>
                      <TransactionProvider>{children}</TransactionProvider>
                    </WalletProvider>
                  </CalendarProvider>
                </WorkspaceProvider>
              </SegmentProvider>
            </MantineProvider>
          </AppearanceProvider>
        </UserDataProvider>
      </SWRConfig>
    </SessionContextProvider>
  );
};

export default Providers;
