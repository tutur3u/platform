import { ReactNode } from 'react';
import { MantineProvider as Provider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { theme as mantineTheme } from '../../styles/mantine-theme';
import { useAppearance } from '../../hooks/useAppearance';

interface Props {
  children: ReactNode;
}

const MantineProvider = (props: Props) => {
  const { theme: appTheme } = useAppearance();

  const theme = {
    ...mantineTheme,
    colorScheme: appTheme,
  };

  return (
    <Provider theme={theme} withGlobalStyles withNormalizeCSS>
      <Notifications position="bottom-right" />
      <ModalsProvider>{props.children}</ModalsProvider>
    </Provider>
  );
};

export default MantineProvider;
