import type { AppProps } from 'next/app';
import { PageWithLayoutProps } from './PageWithLayoutProps';

import { Session } from '@supabase/auth-helpers-react';

export type AppWithLayoutProps = AppProps<{
  initialSession: Session;
}> & {
  Component: PageWithLayoutProps;
};
