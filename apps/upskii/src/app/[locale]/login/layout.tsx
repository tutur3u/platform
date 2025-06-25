import { createClient } from '@tuturuuu/supabase/next/server';
import { getUserDefaultWorkspace } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  const defaultWorkspace = await getUserDefaultWorkspace();
  const wsId = defaultWorkspace?.id;

  if (wsId) {
    redirect(`/${wsId}/home`);
  }

  if (user) {
    redirect('/onboarding');
  }

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
