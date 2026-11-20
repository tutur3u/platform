import { BillSplitsPage } from '@tuturuuu/ui/finance/bill-splits/page';
import { getWorkspaceTier } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { z } from 'zod';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

const targetId = z.uuid().transform((id) => id.toLowerCase());

export default async function WorkspaceBillSplitsPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string; target?: string[] }>;
}) {
  await connection();
  if (process.env.ENABLE_FINANCE_BILL_SPLITS !== 'true') notFound();
  const { wsId, locale, target = [] } = await params;
  const split = target.length ? targetId.safeParse(target[0]) : undefined;
  const participant =
    target[1] === 'participants' && target.length === 3
      ? targetId.safeParse(target[2])
      : undefined;
  const settlement = target[1] === 'settlement' && target.length === 2;
  if (
    (split && !split.success) ||
    (target.length > 1 && !settlement && !participant?.success)
  ) {
    notFound();
  }

  const context = await getFinanceWorkspaceContext(wsId);
  if (!context?.permissions.containsPermission('view_transactions')) notFound();

  const canCreate = context.permissions.containsPermission(
    'create_transactions'
  );
  const canShare =
    Boolean(split?.success) &&
    canCreate &&
    process.env.ENABLE_FINANCE_BILL_SPLIT_STATUS_LINKS === 'true' &&
    (await getWorkspaceTier(context.wsId, { useAdmin: true })) !== 'FREE';
  return (
    <BillSplitsPage
      wsId={context.wsId}
      locale={locale}
      currency={context.currency}
      canCreate={canCreate}
      canShare={canShare}
      remindersEnabled={
        process.env.ENABLE_FINANCE_BILL_SPLIT_REMINDERS === 'true'
      }
      realtimeEnabled={
        process.env.ENABLE_FINANCE_BILL_SPLIT_REALTIME === 'true'
      }
      bankEnabled={
        process.env.ENABLE_FINANCE_BILL_SPLIT_CONTACT_BANKS === 'true'
      }
      canReadBank={context.permissions.containsPermission(
        'view_users_private_info'
      )}
      splitId={split?.data}
      participantId={participant?.data}
      settlement={settlement}
    />
  );
}
