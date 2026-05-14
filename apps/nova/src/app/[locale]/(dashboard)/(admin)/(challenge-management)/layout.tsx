import { redirect } from 'next/navigation';
import {
  requireNovaAppSessionUser,
  requireNovaEnabledRole,
} from '@/lib/app-session';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireNovaAppSessionUser();
  const whitelisted = await requireNovaEnabledRole(user);

  if (!whitelisted?.enabled || !whitelisted?.allow_challenge_management)
    redirect('/home');

  return children;
}
