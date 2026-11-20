import 'server-only';
import { personalWorkspace } from '../../call/server/room-service';
import { type MiraPayer, miraBillingWorkspaceId } from '../mira-entitlement';

/**
 * Private Mira billing: staff drain the Tuturuuu root workspace; every other
 * eligible account pays from its own Personal workspace. A selected tool
 * workspace never changes the payer.
 */
export async function privateMiraBillingWorkspace(
  payer: MiraPayer | undefined,
  userId: string
) {
  if (payer === 'tuturuuu') return miraBillingWorkspaceId(payer, '');
  return personalWorkspace(userId);
}
