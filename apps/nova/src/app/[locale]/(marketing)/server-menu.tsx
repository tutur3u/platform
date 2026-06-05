import {
  getCurrentUserProfile,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { getNovaAppSessionUserFromHeaders } from '@/lib/app-session';
import Menu from './menu';

export default async function ServerMenu() {
  const requestHeaders = await headers();
  const sbUser = await getNovaAppSessionUserFromHeaders();
  const user = sbUser
    ? await getCurrentUserProfile(
        withForwardedInternalApiAuth(requestHeaders)
      ).catch(() => ({
        email: sbUser.email,
        id: sbUser.id,
      }))
    : null;

  return <Menu sbUser={sbUser} user={user} />;
}
