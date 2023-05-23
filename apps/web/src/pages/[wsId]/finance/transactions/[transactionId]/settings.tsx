import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import {
  Button,
  Checkbox,
  Divider,
  NumberInput,
  Select,
  TextInput,
} from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import WalletSelector from '../../../../../components/selectors/WalletSelector';
import { Wallet } from '../../../../../types/primitives/Wallet';
import SettingItemCard from '../../../../../components/settings/SettingItemCard';
import TransactionCategorySelector from '../../../../../components/selectors/TransactionCategorySelector';
import { TransactionCategory } from '../../../../../types/primitives/TransactionCategory';
import { useRouter } from 'next/router';
import { Transaction } from '../../../../../types/primitives/Transaction';
import useSWR from 'swr';
import TransactionDeleteModal from '../../../../../components/loaders/transactions/TransactionDeleteModal';
import TransactionEditModal from '../../../../../components/loaders/transactions/TransactionEditModal';
import { DateTimePicker } from '@mantine/dates';
import useTranslation from 'next-translate/useTranslation';
import 'dayjs/locale/vi';
import moment from 'moment';
import { EyeIcon } from '@heroicons/react/24/outline';
import ThousandMultiplierChips from '../../../../../components/chips/ThousandMultiplierChips';

export const getServerSideProps = enforceHasWorkspaces;

const TransactionSettingsPage: PageWithLayoutProps = () => {
  const router = useRouter();

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('transactions');

  const finance = t('finance');
  const transactions = t('transactions');
  const unnamedWorkspace = t('unnamed-ws');
  const loading = t('common:loading');

  const settingsLabel = t('transaction-details-tabs:settings');

  const { wsId, transactionId, redirectToWallets } = router.query;

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
  const [category, setCategory] = useState<TransactionCategory | null>(null);

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

  const showEditModal = () => {
    if (!transaction) return;
    if (typeof transactionId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">{t('update-wallet')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <TransactionEditModal
          wsId={ws.id}
          transaction={{
            id: transactionId,
            description,
            amount,
            taken_at: takenAt.toISOString(),
            category_id: category?.id,
            wallet_id: wallet?.id,
            report_opt_in: !reportOptOut,
          }}
          redirectUrl={
            redirectToWallets === 'true'
              ? `/${ws.id}/finance/wallets/${
                  wallet?.id || transaction?.wallet_id
                }/transactions`
              : `/${ws.id}/finance/transactions`
          }
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!transaction) return;
    if (typeof transactionId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">{t('delete-wallet')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <TransactionDeleteModal
          wsId={ws.id}
          transactionId={transactionId}
          redirectUrl={
            redirectToWallets === 'true'
              ? `/${ws.id}/finance/wallets/${transaction.wallet_id}/transactions`
              : `/${ws.id}/finance/transactions`
          }
        />
      ),
    });
  };

  const { lang } = useTranslation();

  return (
    <>
      <HeaderX label={`${transactions} - ${finance}`} />
      <div className="flex min-h-full w-full flex-col ">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                transaction
                  ? 'hover:bg-red-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={transaction ? showDeleteModal : undefined}
            >
              {t('delete')}
            </button>

            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showEditModal : undefined}
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
              <WalletSelector
                walletId={transaction?.wallet_id}
                wallet={wallet}
                setWallet={setWallet}
                className="w-full"
                preventPreselected
                hideLabel
              />
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
                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                formatter={(value) =>
                  !Number.isNaN(parseFloat(value || ''))
                    ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                    : ''
                }
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
            title={t('category')}
            description={t('category-description')}
            disabled={!wallet}
          >
            <TransactionCategorySelector
              categoryId={transaction?.category_id}
              category={category}
              setCategory={setCategory}
              preventPreselected
              hideLabel
            />
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
    </>
  );
};

TransactionSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="transaction_details">{page}</NestedLayout>;
};

export default TransactionSettingsPage;
