import '../styles/globals.css';

import { ReactElement, useState } from 'react';
import { AppWithLayoutProps } from '../types/AppWithLayoutProps';
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';

import Providers from '../components/common/Providers';
import Analytics from '../components/common/Analytics';
import usePersistLocale from '../hooks/usePersistLocale';
import { Database } from '@/types/supabase';

export default function Application({
  Component,
  pageProps,
}: AppWithLayoutProps) {
  // Make sure the locale is persisted in a cookie.
  usePersistLocale();

  // Create a new supabase browser client on every first render.
  const [supabase] = useState(() => createPagesBrowserClient<Database>());

  //* Use the layout defined at the page level, if available
  const getLayout = Component?.getLayout || ((page: ReactElement) => page);
  const ComponentWithLayout = getLayout(<Component {...pageProps} />);

  return (
    <>
      <Analytics />
      <Providers supabase={supabase} initialSession={pageProps.initialSession}>
        {ComponentWithLayout}
      </Providers>
    </>
  );
}
