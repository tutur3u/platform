import '../styles/globals.css';

import { ReactElement, useState } from 'react';
import { AppWithLayoutProps } from '../types/AppWithLayoutProps';
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';

import Providers from '../components/common/Providers';
import Analytics from '../components/common/Analytics';
import usePersistLocale from '../hooks/usePersistLocale';
import { Database } from '../types/database.types';
import { AUTH_COOKIE_DOMAIN, DEV_MODE } from '../constants/common';

export default function Application({
  Component,
  pageProps,
}: AppWithLayoutProps) {
  // Make sure the locale is persisted in a cookie.
  usePersistLocale();

  // Create a new supabase browser client on every first render.
  const [supabaseClient] = useState(() =>
  createPagesBrowserClient<Database>(
    (DEV_MODE || !AUTH_COOKIE_DOMAIN)
    ? undefined
    : {
      cookieOptions: {
        domain: AUTH_COOKIE_DOMAIN,
        maxAge: 100000000,
        path: '/',
        sameSite: 'lax',
        secure: true,
      },  
    })
  );

  //* Use the layout defined at the page level, if available
  const getLayout = Component?.getLayout || ((page: ReactElement) => page);
  const ComponentWithLayout = getLayout(<Component {...pageProps} />);

  return (
    <>
      <Analytics />
      <Providers
        supabaseClient={supabaseClient}
        initialSession={pageProps.initialSession}
      >
        {ComponentWithLayout}
      </Providers>
    </>
  );
}
