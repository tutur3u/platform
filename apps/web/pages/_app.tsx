import '../styles/globals.css';

import { ReactElement } from 'react';
import { AppWithLayoutProps } from '../types/AppWithLayoutProps';

export default function Application({
  Component,
  pageProps,
}: AppWithLayoutProps) {
  //* Use the layout defined at the page level, if available
  const getLayout = Component?.getLayout || ((page: ReactElement) => page);
  return getLayout(<Component {...pageProps} />);
}
