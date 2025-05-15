import { getWorkspaces } from '@/lib/workspace-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  const workspaces = await getWorkspaces();
  const wsId = workspaces?.[0]?.id;

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
