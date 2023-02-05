import '../styles/globals.css';

import GoogleTag from 'scripts/next/GoogleTag';

import { ReactElement } from 'react';
import { AppWithLayoutProps } from '../types/AppWithLayoutProps';
import { GOOGLE_TAG_ID } from '../constants/common';

export default function Application({
  Component,
  pageProps,
}: AppWithLayoutProps) {
  //* Use the layout defined at the page level, if available
  const getLayout = Component?.getLayout || ((page: ReactElement) => page);
  const ComponentWithLayout = getLayout(<Component {...pageProps} />);

  return (
    <>
      <GoogleTag id={GOOGLE_TAG_ID} />
      {ComponentWithLayout}
    </>
  );
}
