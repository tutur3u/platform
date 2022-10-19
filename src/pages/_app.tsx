import '../styles/globals.css';
import { MantineProvider } from '@mantine/core';
import { AppWithLayoutProps } from '../types/AppWithLayoutProps';

export default function Application({
  Component,
  pageProps,
}: AppWithLayoutProps) {
  // Use the layout defined at the page level, if available
  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <MantineProvider
      withGlobalStyles
      withNormalizeCSS
      theme={{
        /** Put your mantine theme override here */
        colorScheme: 'dark',
      }}
    >
      {getLayout(<Component {...pageProps} />)}
    </MantineProvider>
  );
}
