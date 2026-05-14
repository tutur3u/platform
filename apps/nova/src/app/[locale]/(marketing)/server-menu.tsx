import {
  getCurrentUserProfile,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import Menu from './menu';

export default async function ServerMenu() {
  const requestHeaders = await headers();
  const sbUser = getNovaAppSessionUserFromRequest({
    headers: requestHeaders,
  });
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
