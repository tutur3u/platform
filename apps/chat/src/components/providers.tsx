import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import type { ReactNode } from 'react';
import { ClientProviders } from './client-providers';

export async function Providers({ children }: { children: ReactNode }) {
  const user = await getSatelliteAppSessionUser('chat');
  return <ClientProviders actorId={user?.id}>{children}</ClientProviders>;
}
