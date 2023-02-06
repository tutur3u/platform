import '../styles/globals.css';

import { ReactElement, useState } from 'react';
import { AppWithLayoutProps } from '../types/AppWithLayoutProps';
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';

import Providers from '../components/common/Providers';
import Analytics from '../components/common/Analytics';

export default function Application({
  Component,
  pageProps,
}: AppWithLayoutProps) {
  // Create a new supabase browser client on every first render.
  const [supabaseClient] = useState(() => createBrowserSupabaseClient());

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
