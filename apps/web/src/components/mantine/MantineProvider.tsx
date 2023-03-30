import { ReactNode } from 'react';
import { MantineProvider as Provider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { theme } from '../../styles/mantine-theme';

interface Props {
  children: ReactNode;
}

const MantineProvider = (props: Props) => {
  return (
    <Provider theme={theme}>
      <Notifications position="bottom-right" />
      <ModalsProvider>{props.children}</ModalsProvider>
    </Provider>
  );
};

export default MantineProvider;
