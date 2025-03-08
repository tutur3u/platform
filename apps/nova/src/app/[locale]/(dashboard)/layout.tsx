import Structure from '@/components/layout/structure';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import React from 'react';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('nova_roles')
    .select('enabled, is_admin')
    .eq('email', user?.email as string)
    .maybeSingle();

  if (!whitelisted?.enabled) redirect('/not-whitelisted');

  return (
    <Structure isAdmin={whitelisted?.is_admin || false}>{children}</Structure>
  );
}
