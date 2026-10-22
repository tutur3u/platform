import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createLegacyActionPorts } from './legacy-action-ports';

export function getLegacyActionPorts() {
  return createLegacyActionPorts({
    load: () => import('./legacy-plan-supplier.server'),
    actor: () => getSatelliteAppSessionUser('meet'),
  });
}
