import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';
import type React from 'react';

export default async function FarmGameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user?.email?.includes('@tuturuuu.com') &&
    !user?.email?.includes('@xwf.tuturuuu.com')
  )
    notFound();

  return children;
}
