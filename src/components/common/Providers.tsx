import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
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
        <ModalsProvider>{children}</ModalsProvider>
      </UserProvider>
    </MantineProvider>
  );
};

export default Providers;
