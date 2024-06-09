'use client';

import SettingItemCard from '../../../../../../../../components/settings/SettingItemCard';
import { Wallet } from '@/types/primitives/Wallet';
import {
  Checkbox,
  Divider,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

interface Props {
  params: {
    wsId: string;
    walletId: string;
  };
}

export default function WalletSettingsPage({
  params: { wsId, walletId },
}: Props) {
  const { t } = useTranslation('wallets');

  const router = useRouter();

  const apiPath =
    wsId && walletId
      ? `/api/workspaces/${wsId}/finance/wallets/${walletId}`
      : null;

  const { data: wallet } = useSWR<Wallet>(apiPath);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [balance, setBalance] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('VND');
  const [type, setType] = useState<string>('STANDARD');
  const [reportOptOut, setReportOptOut] = useState<boolean>(false);

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
    setReportOptOut(!(wallet?.report_opt_in ?? true));
  }, [wallet]);

  const hasRequiredFields = () => name.length > 0;

  return (
    <div className="mt-2 flex min-h-full w-full flex-col">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end gap-2">
          <button
            className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
              wallet ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
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
                            `/${wsId}/finance/transactions/new?targetWalletId=${walletId}&type=transfer&amount=${
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

        <SettingItemCard title={t('type')} description={t('type-description')}>
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

            <Divider className="my-1" variant="dashed" />
            <Checkbox
              label={t('report-opt-out')}
              checked={reportOptOut}
              onChange={(e) => setReportOptOut(e.currentTarget.checked)}
            />
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
  );
}
