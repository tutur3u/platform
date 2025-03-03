'use client';

import ResultComponent from './result-page-component';
import { createClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { useRouter } from 'next/navigation';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ challengeId: string }>;
}

export default async function Page({ params }: Props) {
  const adminSb = await createAdminClient();
  const supabase = createClient();
  const router = useRouter();
  const { challengeId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    router.push('/login');
    return;
  }
  const { data: whitelisted, error: whitelistedError } = await adminSb
    .from('nova_roles')
    .select('enable')
    .eq('email', user?.email as string)
    .maybeSingle();

  if (whitelistedError || !whitelisted?.enable) redirect('/not-wishlist');

  return (
    <>
      <ResultComponent challengeId={challengeId}></ResultComponent>
    </>
  );
}
