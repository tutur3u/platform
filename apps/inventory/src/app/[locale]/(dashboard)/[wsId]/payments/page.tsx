import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { isSepayIntegrationEnabled } from '@/app/api/v1/workspaces/[wsId]/integrations/sepay/feature-flag';
import { resolveSepayConnection } from '@/app/api/v1/workspaces/[wsId]/integrations/sepay/service';
import { InventoryOperatorClient } from '@/components/operator/inventory-operator-client';
import {
  decryptSepayToken,
  SepayReconnectRequiredError,
} from '@/lib/sepay-crypto';
import { getSepayOauthEnv } from '@/lib/sepay-oauth';

async function getSepayNotice(wsId: string) {
  try {
    const user = await getSatelliteAppSessionUser('inventory');
    if (!user) return null;
    const permissions = await getPermissions({ user, wsId });
    if (!permissions?.containsPermission('manage_finance')) return null;

    const input = {
      sbAdmin: await createAdminClient(),
      wsId: permissions.wsId,
    };
    if (!(await isSepayIntegrationEnabled(input))) return null;
    if (!getSepayOauthEnv()) return 'reconfiguring';

    const stored = await resolveSepayConnection(input);
    if (stored) {
      decryptSepayToken(stored.refresh_token_encrypted);
      decryptSepayToken(stored.access_token_encrypted);
    }
  } catch (error) {
    if (error instanceof SepayReconnectRequiredError) return 'reconnect';
    console.error('Failed to load SePay connection status');
  }
  return null;
}

export default async function InventoryPaymentsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const notice = await getSepayNotice(wsId);
  const t = await getTranslations('inventory.operator.payments');

  return (
    <>
      {notice && (
        <Alert>
          <AlertTitle>
            {t(
              notice === 'reconfiguring'
                ? 'sepayReconfiguring'
                : 'sepayReconnect'
            )}
          </AlertTitle>
          <AlertDescription>
            {t(
              notice === 'reconfiguring'
                ? 'sepayReconfiguringDescription'
                : 'sepayReconnectDescription'
            )}
          </AlertDescription>
        </Alert>
      )}
      <InventoryOperatorClient view="payments" wsId={wsId} />
    </>
  );
}
