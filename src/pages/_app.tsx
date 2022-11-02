import '../styles/globals.css';

import { AppWithLayoutProps } from '../types/AppWithLayoutProps';
import Providers from '../components/common/Providers';
import { ReactElement } from 'react';

export default function Application({
  Component,
  pageProps,
}: AppWithLayoutProps) {
  //* Use the layout defined at the page level, if available
  const getLayout = Component?.getLayout || ((page: ReactElement) => page);

  //* Render page components with the layout, if available
  // NOTE: it is wrapped in the Providers component to
  // provide access to necessary context providers
  return <Providers>{getLayout(<Component {...pageProps} />)}</Providers>;
}
