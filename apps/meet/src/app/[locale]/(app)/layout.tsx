import type React from 'react';
import { Suspense } from 'react';
import ServerLayout from './server-layout';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <Suspense>
      <ServerLayout>{children}</ServerLayout>
    </Suspense>
  );
}
