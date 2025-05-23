import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}) {
  const { wsId } = await params;
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('platform_user_roles')
    .select('enabled,  allow_role_management')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!whitelisted?.enabled || !whitelisted?.allow_role_management)
    redirect(`/${wsId}/home`);

  return children;
}
