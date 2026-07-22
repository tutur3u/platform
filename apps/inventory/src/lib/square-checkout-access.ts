import { canInitiateInventoryPosCheckout } from '@tuturuuu/inventory-core/permissions';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function authorizeSquareCheckoutStaff(
  request: Request,
  wsId: string
) {
  const permissions = await getPermissions({ request, wsId });

  if (permissions?.membershipType !== 'MEMBER') {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          code: 'POS_STAFF_ACCESS_REQUIRED',
          message:
            'Sign in with a workspace staff account before starting a Square payment.',
        },
        { status: 403 }
      ),
    };
  }

  if (!canInitiateInventoryPosCheckout(permissions)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          code: 'POS_INITIATE_PERMISSION_REQUIRED',
          message:
            'Your workspace role does not allow starting Square payments. Ask an admin for the POS Operator permission.',
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, permissions };
}
