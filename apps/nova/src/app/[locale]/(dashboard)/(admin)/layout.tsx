import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';

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
    .select('enabled')
    .eq('email', user?.email as string)
    .eq('is_admin', true)
    .maybeSingle();

  if (!whitelisted?.enabled) redirect('/not-whitelisted');

  return <div className="p-4 md:p-8">{children}</div>;
}
