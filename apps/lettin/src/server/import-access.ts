import { EXOCORPSE_WORKSPACE_ID } from '@tuturuuu/internal-api/lettin';
import { type Actor, isCreator, LettinError, type Store } from './context';
import { isTuturuuuStaffEmail } from './staff-access';
export async function requireImportAccess(db: Store, actor: Actor) {
  if (
    !actor.canManage ||
    !(await isCreator(db, actor)) ||
    !isTuturuuuStaffEmail(await actor.verifiedEmail())
  )
    throw new LettinError(403);
}
export async function requireExocorpseSourceAccess(actor: Actor) {
  const { getPermissions } = await import('@tuturuuu/utils/workspace-helper');
  const source = await getPermissions({
    user: { id: actor.id },
    wsId: EXOCORPSE_WORKSPACE_ID,
  });
  if (
    source?.membershipType !== 'MEMBER' ||
    !source.containsPermission('manage_external_projects')
  )
    throw new LettinError(403, 'Exocorpse source access required');
}
