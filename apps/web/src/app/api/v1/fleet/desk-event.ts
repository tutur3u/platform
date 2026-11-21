import { fleetJson } from './session';

export {
  authenticateFleetDesk,
  isFleetDeskRequest,
  verifyFleetDeskEvent,
} from '@/lib/fleet/desk-event';

export function fleetDeskDenied() {
  return fleetJson({ error: 'unauthorized_desk_event' }, 401);
}
