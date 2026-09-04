import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type React from 'react';
import { Suspense } from 'react';

export async function FarmGameRuntime({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isValidTuturuuuEmail(user?.email)) notFound();

  return children;
}

export default function FarmGameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-root-background" />}>
      <FarmGameRuntime>{children}</FarmGameRuntime>
    </Suspense>
  );
}
