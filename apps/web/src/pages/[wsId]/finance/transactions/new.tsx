import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Chip, Divider, NumberInput, Select, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import WalletSelector from '../../../../components/selectors/WalletSelector';
import { Wallet } from '../../../../types/primitives/Wallet';
import SettingItemCard from '../../../../components/settings/SettingItemCard';
import TransactionCategorySelector from '../../../../components/selectors/TransactionCategorySelector';
import { TransactionCategory } from '../../../../types/primitives/TransactionCategory';
import TransactionCreateModal from '../../../../components/loaders/transactions/TransactionCreateModal';
import { DateTimePicker } from '@mantine/dates';
import useTranslation from 'next-translate/useTranslation';
import WalletTransferCreateModal from '../../../../components/loaders/wallets/transfers/WalletTransferCreateModal';
import ThousandMultiplierChips from '../../../../components/chips/ThousandMultiplierChips';
import { useRouter } from 'next/router';
import { mutate } from 'swr';
import 'dayjs/locale/vi';

export const getServerSideProps = enforceHasWorkspaces;

const NewTransactionPage: PageWithLayoutProps = () => {
  const {
    query: {
      date: dateQuery,
      targetWalletId,
      type: queryType,
      amount: queryAmount,
    },
  } = useRouter();

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('transactions');
  const finance = t('finance');
  const transaction = t('transactions');
  const unnamedWorkspace = t('unnamed-ws');
  const create = t('create');
  const adjustment = t('adjustment');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || unnamedWorkspace,
              href: `/${ws.id}`,
            },
            { content: finance, href: `/${ws.id}/finance` },
            {
              content: transaction,
              href: `/${ws.id}/finance/transactions`,
            },
            { content: create, href: `/${ws.id}/finance/transactions/new` },
          ]
        : []
    );

    mutate(`/api/workspaces/${ws?.id}/finance/wallets`);

    return () => setRootSegment([]);
  }, [ws, setRootSegment, finance, transaction, unnamedWorkspace, create]);

  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>(Number(queryAmount) || '');

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
    if (!ws || !originWallet?.id || originWallet?.balance == null) return;
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
            wsId={ws.id}
            originWallet={originWallet}
            destinationWallet={destinationWallet}
            transaction={{
              description,
              amount: amount || 0,
              taken_at: takenAt.toISOString(),
              category_id: category?.id,
            }}
            redirectUrl={`/${ws.id}/finance/wallets`}
          />
        ) : (
          <TransactionCreateModal
            wsId={ws.id}
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
            redirectUrl={`/${ws.id}/finance/transactions`}
          />
        ),
    });
  };

  const { lang } = useTranslation();

  useEffect(() => {
    if (type === 'balance') {
      setAmount(originWallet?.balance || '');
      setDescription(adjustment);
    } else {
      setDescription('');
      setDestinationWallet(null);
    }
  }, [type, originWallet?.balance, queryAmount, adjustment]);

  return (
    <>
      <HeaderX label={`${t('transactions')} - ${t('finance')}`} />
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
                <ThousandMultiplierChips
                  amount={amount}
                  setAmount={setAmount}
                />
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
    </>
  );
};

NewTransactionPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewTransactionPage;
