import { Divider } from '@mantine/core';
import Link from 'next/link';
import moment from 'moment';
import { WorkspaceUser } from '../../types/primitives/WorkspaceUser';
import useSWR from 'swr';
import { getGender } from '../../utils/gender-helper';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { Invoice } from '../../types/primitives/Invoice';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  invoice: Invoice;

  showGender?: boolean;
  showPhone?: boolean;
  showAddress?: boolean;
  showTime?: boolean;
  showStatus?: boolean;
  showAmount?: boolean;
  showPrice?: boolean;
  showCreator?: boolean;
}

const InvoiceCard = ({
  invoice,

  showGender = false,
  showPhone = false,
  showAddress = false,
  showTime = false,
  showStatus = false,
  showAmount = false,
  showPrice = false,
  showCreator = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const { t } = useTranslation('invoice-card');

  const userApiPath = `/api/workspaces/${ws?.id}/users/${invoice.customer_id}`;
  const { data: user } = useSWR<WorkspaceUser>(
    ws?.id && invoice.customer_id ? userApiPath : null
  );

  const creatorApiPath = `/api/users/${invoice.creator_id}`;
  const { data: creator } = useSWR(
    showCreator && ws?.id && invoice.creator_id ? creatorApiPath : null
  );

  const itemsApiPath = `/api/workspaces/${ws?.id}/finance/invoices/${invoice.id}/items`;
  const { data: items } = useSWR<{
    count: number;
  }>(showAmount && ws?.id && invoice.id ? itemsApiPath : null);

  if (!ws) return null;

  const showStatusInfo = showTime || showCreator || showStatus;
  const showExtraInfo = showAmount || showPrice;

  return (
    <Link
      href={`/${ws.id}/finance/invoices/${invoice.id}`}
      className="group flex flex-col items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 text-center transition hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {invoice?.customer_id ? user?.name : t('passersby')}{' '}
            {showGender && user?.gender && (
              <span className="lowercase text-orange-300">
                ({getGender(user.gender)})
              </span>
            )}
          </div>
          {showPhone && invoice?.customer_id && (
            <div className="line-clamp-1 font-semibold text-zinc-400/70">
              {user?.phone || t('missing-phone')}
            </div>
          )}
        </div>
      </div>

      {(showStatusInfo || showExtraInfo) && (
        <Divider className="w-full border-zinc-700" />
      )}

      {showStatusInfo && (
        <div className="flex w-full flex-col items-center justify-center gap-2 p-2">
          {showCreator && (
            <div className="line-clamp-2 w-full rounded border border-cyan-300/20 bg-cyan-300/10 px-4 py-0.5 font-semibold text-cyan-300">
              {t('creator')} -{' '}
              {invoice.creator_id
                ? creator?.display_name || t('unnamed')
                : t('unknown')}
            </div>
          )}

          {showTime && (
            <div className="line-clamp-2 w-full rounded border border-zinc-300/20 bg-zinc-300/10 px-4 py-0.5 font-semibold text-zinc-300">
              {t('created-at')}{' '}
              {moment(invoice?.created_at).format('HH:mm, DD/MM/YYYY')}
            </div>
          )}

          {showStatus && (
            <div
              className={`line-clamp-2 w-full rounded border px-4 py-0.5 font-semibold ${
                invoice?.completed_at
                  ? 'border-green-300/20 bg-green-300/10 text-green-300'
                  : 'border-red-300/20 bg-red-300/10 text-red-300'
              }`}
            >
              {invoice?.completed_at
                ? `${t('completed-at')} ${moment(invoice?.completed_at).format(
                    'HH:mm, DD/MM/YYYY'
                  )}`
                : t('pending-invoice-closed')}
            </div>
          )}
        </div>
      )}

      {showStatusInfo && showExtraInfo && (
        <Divider className="w-full border-zinc-700" />
      )}

      {showExtraInfo && (
        <div className="flex w-full flex-col items-center justify-center gap-2 p-2">
          {showAmount && (
            <div className="line-clamp-1 w-full rounded border border-green-300/20 bg-green-300/10 px-4 py-0.5 font-semibold text-green-300">
              {Intl.NumberFormat('vi-VN', {
                style: 'decimal',
              }).format(items?.count || 0)}
              {t('product')}
            </div>
          )}

          {showPrice && (
            <div className="line-clamp-1 w-full rounded border border-blue-300/20 bg-blue-300/10 px-4 py-0.5 font-semibold text-blue-300">
              {Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
                signDisplay: 'exceptZero',
              }).format((invoice?.price || 0) + (invoice?.total_diff || 0))}
            </div>
          )}
        </div>
      )}

      {showAddress && invoice?.customer_id && (
        <>
          <Divider variant="dashed" className="w-full border-zinc-700" />
          <div className="m-2 h-full w-full px-2">
            <div className="flex h-full items-center justify-center rounded border border-purple-300/20 bg-purple-300/10 p-2 font-semibold text-purple-300">
              {user?.address || t('missing-address')}
            </div>
          </div>
        </>
      )}
    </Link>
  );
};

export default InvoiceCard;
