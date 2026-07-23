import { canInitiateInventoryPosCheckout } from '@tuturuuu/inventory-core/permissions';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

type SquareCheckoutPrincipal = {
  email?: string | null;
  id: string;
};

export async function authorizeSquareCheckoutStaff(
  request: Request,
  wsId: string,
  verifiedPrincipal?: SquareCheckoutPrincipal
) {
  let principal = verifiedPrincipal;

  if (!principal) {
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: {
        targetApp: ['storefront', 'inventory'],
      },
    });

    if (!auth.ok) {
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

    principal = auth.user;
  }

  const permissions = await getPermissions({ user: principal, wsId });

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
