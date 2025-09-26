import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
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

  if (!isValidTuturuuuEmail(user?.email)) notFound();

  return children;
}
