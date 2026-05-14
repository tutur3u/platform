import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  const appSession = getAppSessionClaimsFromRequest(
    { headers: await headers() },
    { targetApp: 'nova' }
  );

  if (appSession) redirect('/home');

  return (
    <div
      id="main-content"
      className="h-screen max-h-screen min-h-screen overflow-y-auto"
    >
      {children}
    </div>
  );
}
