import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  if (user) redirect('/home');

  return (
    <>
      <div
        id="main-content"
        className="h-screen max-h-screen min-h-screen overflow-y-auto"
      >
        {children}
      </div>
    </>
  );
}
