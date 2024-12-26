// import { getCurrentSupabaseUser } from '@/lib/user-helper';
// import { VercelToolbar } from '@vercel/toolbar/next';
import { Suspense } from 'react';

export async function StaffToolbar() {
  // const user = await getCurrentSupabaseUser();
  // const isEmployee = user?.email?.endsWith('@tuturuuu.com') ?? false;

  const enabled = false;
  if (!enabled) return null;

  // const showToolbar = isEmployee;
  return (
    <Suspense fallback={<div />}>
      {/* {showToolbar ? <VercelToolbar /> : null} */}
    </Suspense>
  );
}
