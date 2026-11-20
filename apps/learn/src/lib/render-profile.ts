import { getSatelliteCurrentUser } from '@tuturuuu/satellite/auth';
import {
  createRequestLocal,
  maybeBridgeRequest,
} from '@tuturuuu/start-bridge/request-context/reader';

const renderProfile = createRequestLocal<
  ReturnType<typeof getSatelliteCurrentUser>
>('Learn render profile');

export function getLearnRenderProfile() {
  if (!maybeBridgeRequest()) return getSatelliteCurrentUser('learn');

  const existing = renderProfile.get();
  if (existing) return existing;
  const profile = getSatelliteCurrentUser('learn');
  renderProfile.set(profile);
  return profile;
}
