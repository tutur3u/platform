import { createClient } from '@tuturuuu/supabase/next/server';
import { connection } from 'next/server';
import { Suspense } from 'react';
import DeleteAccountFlow from './delete-account-flow';
import PublicAccountDeletion from './public-account-deletion';

/**
 * Store listings link here as the account-deletion URL, so signed-out
 * visitors must see the deletion steps and retention facts without signing
 * in. The only session-dependent work on this path is the auth check that
 * chooses between the static explanation and the signed-in deletion flow.
 */
export async function AccountDeleteRuntime() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <DeleteAccountFlow /> : <PublicAccountDeletion />;
}

export default function DeleteAccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AccountDeleteRuntime />
    </Suspense>
  );
}
