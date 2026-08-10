import type React from 'react';
import ServerLayout from './server-layout';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <ServerLayout>{children}</ServerLayout>;
}
