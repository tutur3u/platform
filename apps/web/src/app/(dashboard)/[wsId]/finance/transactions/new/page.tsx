'use client';

import { useEffect, useState } from 'react';
import {
  Checkbox,
  Chip,
  Divider,
  NumberInput,
  Select,
  TextInput,
} from '@mantine/core';
import { openModal } from '@mantine/modals';
import WalletSelector from '../../../../../../components/selectors/WalletSelector';
import { Wallet } from '../../../../../../types/primitives/Wallet';
import SettingItemCard from '../../../../../../components/settings/SettingItemCard';
import TransactionCategorySelector from '../../../../../../components/selectors/TransactionCategorySelector';
import { TransactionCategory } from '../../../../../../types/primitives/TransactionCategory';
import TransactionCreateModal from '../../../../../../components/loaders/transactions/TransactionCreateModal';
import { DateTimePicker } from '@mantine/dates';
import useTranslation from 'next-translate/useTranslation';
import WalletTransferCreateModal from '../../../../../../components/loaders/wallets/transfers/WalletTransferCreateModal';
import ThousandMultiplierChips from '../../../../../../components/chips/ThousandMultiplierChips';
import 'dayjs/locale/vi';

interface Props {
  params: {
    wsId: string;
    type?: string;
    amount?: string;
    date?: string;
    targetWalletId?: string;
  };
}

export default function NewTransactionPage({
  params: {
    wsId,
    type: queryType,
    amount: queryAmount,
    date: dateQuery,
    targetWalletId,
  },
}: Props) {
  const { t } = useTranslation('transactions');
  const adjustment = t('adjustment');

  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>(Number(queryAmount) || '');
  const [reportOptOut, setReportOptOut] = useState<boolean>(false);

  const [takenAt, setTakenAt] = useState<Date>(
    dateQuery ? new Date(dateQuery as string) : new Date()
  );

  useEffect(() => {
    if (!dateQuery) return;

    const date = new Date(dateQuery as string);
    const now = new Date();

    setTakenAt(
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
      )
    );
  }, [dateQuery]);

  const [originWallet, setOriginWallet] = useState<Wallet | null>(null);
  const [destinationWallet, setDestinationWallet] = useState<Wallet | null>(
    null
  );

  const [category, setCategory] = useState<TransactionCategory | null>(null);

  const parseType = (type?: string) => {
    switch (type) {
      case 'transfer':
      case 'balance':
        return type;

      default:
        return 'default';
    }
  };

  const [type, setType] = useState<'default' | 'transfer' | 'balance'>(
    parseType(queryType?.toString()) ?? 'default'
  );

  useEffect(() => {
    if (!category || type !== 'default') return;

    setAmount((oldAmount) =>
      oldAmount !== ''
        ? category?.is_expense === false
          ? Math.abs(oldAmount)
          : -Math.abs(oldAmount)
        : ''
    );
  }, [category, type]);

  const hasRequiredFields = () =>
    (type !== 'balance' ? true : amount != originWallet?.balance) &&
    (type === 'transfer'
      ? originWallet && destinationWallet && amount
      : originWallet);

  const showCreateModal = () => {
    if (!originWallet?.id || originWallet?.balance == null) return;
    if (type === 'transfer' && !destinationWallet) return;

    openModal({
      title: <div className="font-semibold">{t('create-transaction')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children:
        type === 'transfer' && destinationWallet ? (
          <WalletTransferCreateModal
            wsId={wsId}
            originWallet={originWallet}
            destinationWallet={destinationWallet}
            transaction={{
              description,
              amount: amount || 0,
              taken_at: takenAt.toISOString(),
              category_id: category?.id,
              report_opt_in: !reportOptOut,
            }}
            redirectUrl={`/${wsId}/finance/wallets`}
          />
        ) : (
          <TransactionCreateModal
            wsId={wsId}
            walletId={originWallet.id}
            transaction={{
              description,
              amount:
                amount !== ''
                  ? type === 'balance'
                    ? amount - originWallet.balance
                    : amount
                  : 0,
              taken_at: takenAt.toISOString(),
              category_id: category?.id,
            }}
            redirectUrl={`/${wsId}/finance/transactions`}
          />
        ),
    });
  };

  const { lang } = useTranslation();

  useEffect(() => {
    if (type === 'default') setReportOptOut(false);
    else setReportOptOut(true);

    if (type === 'balance') {
      setAmount(originWallet?.balance || '');
      setDescription(adjustment);
    } else {
      setDescription('');
      setDestinationWallet(null);
    }
  }, [type, originWallet?.balance, queryAmount, adjustment]);

  return (
    <div className="mt-2 flex min-h-full w-full flex-col ">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end">
          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
            onClick={hasRequiredFields() ? showCreateModal : undefined}
          >
            {t('create')}
          </button>
        </div>
      </div>

      <Divider className="my-4" />
      <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="col-span-full">
          <div className="text-2xl font-semibold">{t('basic-info')}</div>
          <Divider className="mt-2" variant="dashed" />
        </div>

        <Chip.Group
          value={type}
          onChange={(value) =>
            setType(value as 'default' | 'transfer' | 'balance')
          }
        >
          <div className="col-span-full flex flex-wrap gap-2">
            <Chip variant="light" value="default">
              {t('default')}
            </Chip>
            <Chip variant="light" value="transfer">
              {t('transfer')}
            </Chip>
            <Chip variant="light" value="balance">
              {t('adjustment')}
            </Chip>
          </div>
        </Chip.Group>

        <SettingItemCard
          title={t('origin-wallet')}
          description={
            type === 'transfer'
              ? t('origin-wallet-description-transfer')
              : t('origin-wallet-description')
          }
        >
          <div className="grid gap-2">
            <WalletSelector
              wallet={originWallet}
              setWallet={(wallet) => {
                if (type === 'balance') setAmount(wallet?.balance || 0);
                setOriginWallet(wallet);
              }}
              blacklist={
                type !== 'transfer'
                  ? []
                  : destinationWallet?.id
                  ? [destinationWallet.id]
                  : []
              }
              hideLabel
            />

            {type === 'transfer' && originWallet && amount ? (
              <>
                <Divider variant="dashed" />
                <div className="text-zinc-700 dark:text-zinc-400">
                  {t('this-transaction-will')}{' '}
                  <span className="font-semibold text-zinc-200">
                    {Intl.NumberFormat(lang, {
                      style: 'currency',
                      currency: originWallet.currency,
                      signDisplay: 'always',
                    }).format(amount * -1)}
                  </span>{' '}
                  {t('from-current-balance')}
                </div>
              </>
            ) : null}
          </div>
        </SettingItemCard>

        {type === 'transfer' ? (
          <SettingItemCard
            title={t('destination-wallet')}
            description={t('destination-wallet-description')}
          >
            <div className="grid gap-2">
              <WalletSelector
                walletId={targetWalletId?.toString()}
                wallet={destinationWallet}
                setWallet={setDestinationWallet}
                blacklist={originWallet?.id ? [originWallet.id] : undefined}
                preventPreselected
                disableQuery
                clearable
                hideLabel
              />

              {destinationWallet && amount ? (
                <>
                  <Divider variant="dashed" />
                  <div className="text-zinc-700 dark:text-zinc-400">
                    {t('this-transaction-will')}{' '}
                    <span className="font-semibold text-zinc-200">
                      {Intl.NumberFormat(lang, {
                        style: 'currency',
                        currency: destinationWallet.currency,
                        signDisplay: 'always',
                      }).format(amount)}
                    </span>{' '}
                    {t('from-current-balance')}
                  </div>
                </>
              ) : null}
            </div>
          </SettingItemCard>
        ) : (
          <SettingItemCard
            title={t('description')}
            description={t('description-description')}
            disabled={!originWallet}
          >
            <TextInput
              placeholder={t('description-placeholder')}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              disabled={!originWallet}
            />
          </SettingItemCard>
        )}

        <SettingItemCard
          title={t('datetime')}
          description={t('datetime-description')}
          disabled={!originWallet}
        >
          <DateTimePicker
            value={takenAt}
            onChange={(date) => setTakenAt(date || new Date())}
            className="w-full"
            disabled={!originWallet}
            valueFormat="HH:mm - dddd, DD/MM/YYYY"
            locale={lang}
            classNames={{
              root: 'dark:bg-[#25262b]',
            }}
          />
        </SettingItemCard>

        <SettingItemCard
          title={type === 'balance' ? t('balance') : t('amount')}
          description={
            type === 'balance'
              ? t('balance-description')
              : t('amount-description')
          }
          disabled={!originWallet}
        >
          <div className="grid gap-2">
            <NumberInput
              placeholder={Intl.NumberFormat(lang, {
                style: 'decimal',
              }).format(0)}
              value={amount}
              onChange={(num) =>
                num === ''
                  ? setAmount(num)
                  : category
                  ? setAmount(
                      num *
                        (type === 'default'
                          ? category?.is_expense === false
                            ? 1
                            : -1
                          : 1)
                    )
                  : setAmount(num)
              }
              className="w-full"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              parser={(value) => value?.replace(/\$\s?|(,*)/g, '')}
              formatter={(value) =>
                !Number.isNaN(parseFloat(value || ''))
                  ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  : ''
              }
              disabled={!originWallet}
            />

            {amount != '' && amount != 0 && (
              <ThousandMultiplierChips amount={amount} setAmount={setAmount} />
            )}

            {type === 'balance' &&
              originWallet?.balance != null &&
              amount != '' && (
                <>
                  <Divider variant="dashed" />

                  <div>
                    {t('this-transaction-will')}{' '}
                    <span className="font-semibold text-zinc-200">
                      {Intl.NumberFormat(lang, {
                        style: 'currency',
                        currency: originWallet.currency,
                        signDisplay: 'always',
                      }).format(amount - originWallet.balance)}
                    </span>{' '}
                    {t('from-current-balance')}
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
          title={t('category')}
          description={t('category-description')}
        >
          <TransactionCategorySelector
            category={
              type === 'transfer'
                ? {
                    id: 'transfer',
                  }
                : type === 'default'
                ? category
                : null
            }
            showTransfer={type === 'transfer'}
            disabled={type === 'transfer'}
            setCategory={setCategory}
            hideLabel
          />
        </SettingItemCard>

        <SettingItemCard
          title={t('currency')}
          description={t('currency-description')}
        >
          <Select
            placeholder={t('currency-placeholder')}
            value={originWallet?.currency}
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
