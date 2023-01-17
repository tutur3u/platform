import '../styles/globals.css';

import { Analytics } from '@vercel/analytics/react';

import { AppWithLayoutProps } from '../types/AppWithLayoutProps';
import Providers from '../components/common/Providers';
import { ReactElement, useState } from 'react';

import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { RouterTransition } from '../components/router/RouterTransition';

export default function Application({
  Component,
  pageProps,
}: AppWithLayoutProps) {
  // Create a new supabase browser client on every first render.
  const [supabaseClient] = useState(() => createBrowserSupabaseClient());

  //* Use the layout defined at the page level, if available
  const getLayout = Component?.getLayout || ((page: ReactElement) => page);

  return (
    <Providers
      supabaseClient={supabaseClient}
      initialSession={pageProps.initialSession}
    >
      <RouterTransition />
      <Analytics />
      {getLayout(<Component {...pageProps} />)}
    </Providers>
  );
}
