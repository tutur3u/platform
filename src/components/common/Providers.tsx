import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { SidebarProvider } from '../../hooks/useSidebar';
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
        <SidebarProvider>
          <ModalsProvider>{children}</ModalsProvider>
        </SidebarProvider>
      </UserProvider>
    </MantineProvider>
  );
};

export default Providers;
