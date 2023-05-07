import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import {
  Divider,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../../components/settings/SettingItemCard';
import { useRouter } from 'next/router';
import { Wallet } from '../../../../../types/primitives/Wallet';
import useSWR from 'swr';
import WalletDeleteModal from '../../../../../components/loaders/wallets/WalletDeleteModal';
import WalletEditModal from '../../../../../components/loaders/wallets/WalletEditModal';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const WalletSettingsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('wallets');
  const finance = t('finance');
  const wallets = t('wallet');
  const unnamedWorkspace = t('unnamed-ws');
  const unnamedWallet = t('unnamed-wallet');
  const settings = t('settings');

  const router = useRouter();
  const { wsId, walletId } = router.query;

  const apiPath =
    wsId && walletId
      ? `/api/workspaces/${wsId}/finance/wallets/${walletId}`
      : null;

  const { data: wallet } = useSWR<Wallet>(apiPath);

  useEffect(() => {
    setRootSegment(
      ws && wallet
        ? [
            {
              content: ws?.name || unnamedWorkspace,
              href: `/${wsId}`,
            },
            { content: finance, href: `/${wsId}/finance` },
            {
              content: wallets,
              href: `/${wsId}/finance/wallets`,
            },
            {
              content: wallet?.name || unnamedWallet,
              href: `/${wsId}/finance/wallets/${walletId}`,
            },
            {
              content: settings,
              href: `/${wsId}/finance/wallets/${walletId}/settings`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [
    wsId,
    walletId,
    ws,
    wallet,
    setRootSegment,
    finance,
    wallets,
    settings,
    unnamedWorkspace,
    unnamedWallet,
  ]);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [balance, setBalance] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('VND');
  const [type, setType] = useState<string>('STANDARD');

  const [statementDate, setStatementDate] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<number>(0);
  const [limit, setLimit] = useState<number | ''>('');

  useEffect(() => {
    if (!wallet) return;
    setName(wallet?.name || '');
    setDescription(wallet?.description || '');
    setBalance(wallet?.balance || 0);
    setCurrency(wallet?.currency || 'VND');
    setType(wallet?.type || 'STANDARD');
    setStatementDate(wallet?.statement_date || 0);
    setPaymentDate(wallet?.payment_date || 0);
    setLimit(wallet?.limit || '');
  }, [wallet]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!wallet) return;
    if (typeof walletId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">{t('update-wallet')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <WalletEditModal
          wsId={ws.id}
          oldWallet={wallet}
          wallet={{
            id: walletId,
            name,
            description,
            balance,
            currency,
            type,
            limit: limit === '' ? undefined : limit,
            statement_date: statementDate,
            payment_date: paymentDate,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!wallet) return;
    if (typeof walletId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">{t('delete-wallet')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <WalletDeleteModal wsId={ws.id} walletId={walletId} />,
    });
  };

  return (
    <>
      <HeaderX label={`${wallets} - ${finance}`} />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                wallet ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
              }`}
              onClick={wallet ? showDeleteModal : undefined}
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
            title={t('wallet-name')}
            description={t('wallet-name-description')}
          >
            <TextInput
              placeholder={t('wallet-name-placeholder')}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={type === 'STANDARD' ? t('balance') : t('available-credit')}
            description={
              type === 'STANDARD'
                ? t('balance-description')
                : t('available-credit-description')
            }
          >
            <NumberInput
              placeholder={t('input-amount')}
              value={balance}
              onChange={(num) => setBalance(Number(num))}
              className="w-full"
              min={0}
              parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
              formatter={(value) =>
                !Number.isNaN(parseFloat(value || ''))
                  ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  : ''
              }
            />

            {type === 'CREDIT' && (
              <>
                {(limit || 0) - balance != 0 && (
                  <div
                    className={`mt-2 text-sm ${
                      (limit || 0) - balance > 0
                        ? 'text-red-300'
                        : 'text-green-300'
                    }`}
                  >
                    Bạn {balance != wallet?.balance ? 'sẽ' : 'đang'}{' '}
                    {(limit || 0) - balance > 0 ? 'nợ' : 'dư'}{' '}
                    <span className="font-semibold">
                      {Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: currency,
                      }).format(Math.abs((limit || 0) - balance))}
                    </span>{' '}
                    trong nguồn tiền này.
                  </div>
                )}

                {(balance !== wallet?.balance || balance < (limit || 0)) && (
                  <Divider className="my-2" variant="dashed" />
                )}

                <div className="grid w-full gap-2 font-semibold">
                  {balance !== wallet?.balance ? (
                    <button
                      onClick={() => setBalance(wallet?.balance || 0)}
                      className="w-full rounded border border-zinc-300/10 bg-zinc-300/10 p-2 text-zinc-300 transition hover:bg-zinc-300/20"
                    >
                      {t('cancel-payment')}
                    </button>
                  ) : (
                    balance < (limit || 0) && (
                      <>
                        <button
                          onClick={() => setBalance(limit || 0)}
                          className="w-full rounded border border-blue-300/10 bg-blue-300/10 p-2 text-blue-300 transition hover:bg-blue-300/20"
                        >
                          {t('pay-now')}
                        </button>

                        <button
                          onClick={() =>
                            router.push(
                              `/${
                                ws?.id
                              }/finance/transactions/new?targetWalletId=${walletId}&type=transfer&amount=${
                                (limit || 0) - balance
                              }`
                            )
                          }
                          className="w-full rounded border border-purple-300/10 bg-purple-300/10 p-2 text-purple-300 transition hover:bg-purple-300/20"
                        >
                          {t('pay-by-another-wallet')}
                        </button>
                      </>
                    )
                  )}
                </div>
              </>
            )}
          </SettingItemCard>

          <SettingItemCard
            title={t('currency')}
            description={t('currency-description')}
          >
            <Select
              placeholder={t('currency-placeholder')}
              value={currency}
              onChange={(e) => setCurrency(e || 'VND')}
              data={[
                {
                  label: 'Việt Nam Đồng (VND)',
                  value: 'VND',
                },
              ]}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={t('description')}
            description={t('description-description')}
          >
            <Textarea
              placeholder={t('description-placeholder')}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              minRows={3}
              maxRows={5}
            />
          </SettingItemCard>

          <SettingItemCard
            title={t('type')}
            description={t('type-description')}
          >
            <div className="grid gap-2">
              <Select
                placeholder={t('type-placeholder')}
                value={type}
                onChange={(e) => {
                  setType(e || 'STANDARD');
                  if (e === 'CREDIT') {
                    setLimit(balance);
                  } else {
                    setLimit('');
                  }
                }}
                data={[
                  {
                    label: t('standard'),
                    value: 'STANDARD',
                  },
                  {
                    label: t('credit'),
                    value: 'CREDIT',
                  },
                ]}
                required
              />

              {type === 'CREDIT' && (
                <>
                  <NumberInput
                    label={t('credit-limit')}
                    placeholder={t('credit-limit-placeholder')}
                    value={limit}
                    onChange={(num) => setLimit(Number(num))}
                    min={0}
                    parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                    formatter={(value) =>
                      !Number.isNaN(parseFloat(value || ''))
                        ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                        : ''
                    }
                  />

                  <div className="flex w-full gap-4">
                    <Select
                      label={t('statement-date')}
                      placeholder={t('statement-date-placeholder')}
                      value={statementDate.toString()}
                      onChange={(e) => setStatementDate(Number(e))}
                      data={Array.from({ length: 28 }, (_, i) => ({
                        label: `${i + 1}`,
                        value: `${i + 1}`,
                      }))}
                      className="w-full"
                    />

                    <Select
                      label={t('payment-due-date')}
                      placeholder={t('payment-due-date-placeholder')}
                      value={paymentDate.toString()}
                      onChange={(e) => setPaymentDate(Number(e))}
                      data={Array.from({ length: 28 }, (_, i) => ({
                        label: `${i + 1}`,
                        value: `${i + 1}`,
                      }))}
                      className="w-full"
                    />
                  </div>
                </>
              )}
            </div>
          </SettingItemCard>

          <SettingItemCard
            title={t('icon')}
            description={t('icon-description')}
            disabled
            comingSoon
          />
        </div>
      </div>
    </>
  );
};

WalletSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="wallet_details">{page}</NestedLayout>;
};

export default WalletSettingsPage;
