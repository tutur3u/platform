import type React from 'react';
import { Suspense } from 'react';
import ServerLayout from './server-layout';

interface LayoutProps {
  children: React.ReactNode;
}

// This shell resolves locale, authentication, and Supabase-backed meeting data
// before rendering, so it intentionally blocks instead of prerendering.
export const instant = false;

export default function Layout({ children }: LayoutProps) {
  return (
    <Suspense>
      <ServerLayout>{children}</ServerLayout>
    </Suspense>
  );
}
