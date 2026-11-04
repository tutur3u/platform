import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
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

  if (
    !isVerifiedTuturuuuStaffSession(
      user &&
        (await getVerifiedAuthUser(
          await createAdminClient({ noCookie: true }),
          user.id
        )),
      { allowXwf: true }
    )
  )
    notFound();

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
