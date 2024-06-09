import ThousandMultiplierChips from '../../../../../../../components/chips/ThousandMultiplierChips';
import SettingItemCard from '../../../../../../../components/settings/SettingItemCard';
import { useSegments } from '@/hooks/useSegments';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Transaction } from '@/types/primitives/Transaction';
import { TransactionCategory } from '@/types/primitives/TransactionCategory';
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
import { useEffect, useState } from 'react';
import useSWR from 'swr';

export default function TransactionSettingsPage() {
  const router = useRouter();

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('transactions');

  const finance = t('finance');
  const transactions = t('transactions');
  const unnamedWorkspace = t('unnamed-ws');
  const loading = t('common:loading');

  const settingsLabel = t('transaction-details-tabs:settings');

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
              content: (transactionId as string) ?? loading,
              href: `/${ws.id}/finance/transactions/${transactionId}`,
            },
            {
              content: settingsLabel,
              href: `/${ws.id}/finance/transactions/${transactionId}/settings`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [
    ws,
    transaction,
    transactionId,
    setRootSegment,
    finance,
    transactions,
    settingsLabel,
    unnamedWorkspace,
    loading,
  ]);

  const [description, setDescription] = useState<string>('');
  const [takenAt, setTakenAt] = useState<Date>(new Date());
  const [amount, setAmount] = useState<number>(0);
  const [reportOptOut, setReportOptOut] = useState<boolean>(false);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [category] = useState<TransactionCategory | null>(null);

  useEffect(() => {
    if (category && description === category.name) setDescription('');
  }, [category, description]);

  useEffect(() => {
    if (transaction) {
      setDescription(transaction?.description || '');
      setTakenAt(
        transaction?.taken_at
          ? moment(transaction?.taken_at).toDate()
          : new Date()
      );
      setAmount(transaction?.amount || 0);
      setReportOptOut(!(transaction?.report_opt_in ?? true));
    }
  }, [transaction]);

  useEffect(() => {
    if (!category) return;
    setAmount((oldAmount) =>
      category.is_expense === false ? Math.abs(oldAmount) : -Math.abs(oldAmount)
    );
  }, [category, amount]);

  useEffect(() => {
    if (transactionWallet) setWallet(transactionWallet);
  }, [transactionWallet]);

  const hasRequiredFields = () => amount != 0 && wallet;

  const { lang } = useTranslation();

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end gap-2">
          <button
            className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
              transaction
                ? 'hover:bg-red-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            {t('delete')}
          </button>

          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            {t('save-changes')}
          </button>
        </div>
      </div>

      <Divider className="my-4" />
      <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="col-span-full">
          <div className="text-2xl font-semibold">{t('basic-info')}</div>
          <Divider className="my-2" variant="dashed" />
        </div>

        <SettingItemCard
          title={t('wallets')}
          description={t('wallet-description')}
        >
          <div className="flex gap-2">
            {ws?.id && wallet?.id && (
              <Button
                variant="light"
                className="bg-blue-300/10"
                onClick={() =>
                  router.push(`/${ws.id}/finance/wallets/${wallet.id}`)
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
          disabled={!wallet}
        >
          <TextInput
            placeholder={t('description-placeholder')}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={!wallet}
          />
        </SettingItemCard>

        <SettingItemCard
          title={t('datetime')}
          description={t('datetime-description')}
          disabled={!wallet}
        >
          <DateTimePicker
            value={takenAt}
            onChange={(date) => setTakenAt(date || new Date())}
            className="w-full"
            disabled={!wallet}
            valueFormat="HH:mm - dddd, DD/MM/YYYY"
            placeholder={'Date & time'}
            locale={lang}
          />
        </SettingItemCard>

        <SettingItemCard
          title={t('amount')}
          description={t('amount-description')}
          disabled={!wallet}
        >
          <div className="grid gap-2">
            <NumberInput
              placeholder={t('amount-placeholder')}
              value={amount}
              onChange={(num) =>
                category
                  ? setAmount(
                      Number(num) * (category?.is_expense === false ? 1 : -1)
                    )
                  : setAmount(Number(num))
              }
              className="w-full"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              disabled={!wallet}
            />

            {amount != 0 && (
              <ThousandMultiplierChips
                amount={amount}
                setAmount={setAmount}
                hidden={!transaction?.amount || amount === transaction.amount}
              />
            )}

            <Divider className="my-1" variant="dashed" />
            <Checkbox
              label={t('report-opt-out')}
              checked={reportOptOut}
              onChange={(e) => setReportOptOut(e.currentTarget.checked)}
            />
          </div>
        </SettingItemCard>

        <SettingItemCard
          title={t('currency')}
          description={t('currency-description')}
          disabled={!wallet}
        >
          <Select
            placeholder={t('currency-placeholder')}
            value={wallet?.currency}
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
