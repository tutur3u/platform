import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { NotificationsProvider } from '@mantine/notifications';
import { UserProvider } from '../../hooks/useUser';

interface ProvidersProps {
  children: React.ReactNode;
}

const Providers = ({ children }: ProvidersProps) => {
  return (
    <MantineProvider
      withGlobalStyles
      withNormalizeCSS
      theme={{
        colorScheme: 'dark',
        defaultRadius: 'md',
      }}
    >
      <UserProvider>
        <ModalsProvider>
          <NotificationsProvider position="bottom-left">
            {children}
          </NotificationsProvider>
        </ModalsProvider>
      </UserProvider>
    </MantineProvider>
  );
};

export default Providers;
