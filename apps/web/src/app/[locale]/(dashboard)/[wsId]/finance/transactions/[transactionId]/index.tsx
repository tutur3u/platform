import SettingItemCard from '../../../../../../../components/settings/SettingItemCard';
import { useSegments } from '@/hooks/useSegments';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Transaction } from '@/types/primitives/Transaction';
import { Wallet } from '@/types/primitives/Wallet';
import { EyeIcon } from '@heroicons/react/24/outline';
import {
  Button,
  Checkbox,
  Divider,
  NumberInput,
  Select,
  TextInput,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import 'dayjs/locale/vi';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import useSWR from 'swr';

export default function TransactionDetailsPage() {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('transactions');

  const finance = t('finance');
  const transactions = t('transactions');
  const unnamedWorkspace = t('unnamed-ws');
  const loading = t('common:loading');

  const informationLabel = t('transaction-details-tabs:information');

  const router = useRouter();
  const { wsId, transactionId } = router.query;

  const apiPath =
    wsId && transactionId
      ? `/api/workspaces/${wsId}/finance/transactions/${transactionId}`
      : null;

  const { data: transaction } = useSWR<Transaction>(apiPath);

  const walletApiPath =
    wsId && transaction?.wallet_id
      ? `/api/workspaces/${wsId}/finance/wallets/${transaction?.wallet_id}`
      : null;

  const { data: transactionWallet } = useSWR<Wallet>(walletApiPath);

  useEffect(() => {
    setRootSegment(
      ws && transaction
        ? [
            {
              content: ws?.name || unnamedWorkspace,
              href: `/${ws.id}`,
            },
            { content: finance, href: `/${ws.id}/finance` },
            {
              content: transactions,
              href: `/${ws.id}/finance/transactions`,
            },
            {
              content: transaction?.id || loading,
              href: `/${ws.id}/finance/transactions/${transaction?.id}`,
            },
            {
              content: informationLabel,
              href: `/${ws.id}/finance/transactions/${transaction?.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [
    ws,
    transaction,
    setRootSegment,
    finance,
    transactions,
    informationLabel,
    unnamedWorkspace,
    loading,
  ]);

  const { lang } = useTranslation();

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="col-span-full">
          <div className="text-2xl font-semibold">{t('basic-info')}</div>
          <Divider className="my-2" variant="dashed" />
        </div>

        <SettingItemCard
          title={t('wallets')}
          description={t('wallet-description')}
          disabled={!transactionWallet}
        >
          <div className="flex gap-2">
            {ws?.id && transactionWallet?.id && (
              <Button
                variant="light"
                className="bg-blue-300/10"
                onClick={() =>
                  router.push(
                    `/${ws.id}/finance/wallets/${transactionWallet.id}`
                  )
                }
              >
                <EyeIcon className="h-5 w-5" />
              </Button>
            )}
          </div>
        </SettingItemCard>

        <SettingItemCard
          title={t('description')}
          description={t('description-description')}
          disabled={!transactionWallet}
        >
          <TextInput
            placeholder={t('description-placeholder')}
            value={transaction?.description}
            disabled
          />
        </SettingItemCard>

        <SettingItemCard
          title={t('datetime')}
          description={t('datetime-description')}
          disabled={!transactionWallet}
        >
          <DateTimePicker
            value={
              transaction?.taken_at
                ? moment(transaction?.taken_at).toDate()
                : null
            }
            className="w-full"
            valueFormat="HH:mm - dddd, DD/MM/YYYY"
            placeholder={'Date & time'}
            locale={lang}
            disabled
          />
        </SettingItemCard>

        <SettingItemCard
          title={t('amount')}
          description={t('amount-description')}
          disabled={!transactionWallet}
        >
          <div className="grid gap-2">
            <NumberInput
              placeholder={t('amount-placeholder')}
              value={transaction?.amount}
              className="w-full"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              disabled
            />

            <Divider className="my-1" variant="dashed" />
            <Checkbox
              label={t('report-opt-out')}
              checked={!transaction?.report_opt_in}
              disabled
            />
          </div>
        </SettingItemCard>

        <SettingItemCard
          title={t('currency')}
          description={t('currency-description')}
          disabled={!transactionWallet}
        >
          <Select
            placeholder={t('currency-placeholder')}
            value={transactionWallet?.currency}
            data={[
              {
                label: 'Việt Nam Đồng (VND)',
                value: 'VND',
              },
            ]}
            disabled
            required
          />
        </SettingItemCard>
      </div>
    </div>
  );
}
