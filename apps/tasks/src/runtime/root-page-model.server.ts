import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { headers } from '@tuturuuu/start-bridge/next/headers';
import { notFound, redirect } from '@tuturuuu/start-bridge/next/navigation';
import {
  isRootRedirectExcluded,
  resolveTasksRootEntry,
} from '../lib/tasks/root-entry';

/**
 * The app root (`/`, `/<locale>`) reached without the proxy (client
 * navigation through a server function): the same authenticated decision
 * `proxy.ts` makes for document requests. Excluded roots have no page, as in
 * the Next build.
 */
export async function rootEntry({
  locale,
  localePrefixed,
  search,
}: {
  locale: string;
  localePrefixed: boolean;
  search: URLSearchParams;
}) {
  if (isRootRedirectExcluded(search)) notFound();
  const user = await getSatelliteAppSessionUser('tasks');
  if (!user?.id) redirect('/login');
  const query = search.toString();
  return resolveTasksRootEntry({
    auth: withForwardedInternalApiAuth(await headers()),
    locale,
    localePrefixed,
    search: query ? `?${query}` : '',
  });
}
