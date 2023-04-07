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
import 'dayjs/locale/vi';
import WalletTransferCreateModal from '../../../../components/loaders/wallets/transfers/WalletTransferCreateModal';

export const getServerSideProps = enforceHasWorkspaces;

const NewTransactionPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Tài chính', href: `/${ws.id}/finance` },
            {
              content: 'Giao dịch',
              href: `/${ws.id}/finance/transactions`,
            },
            { content: 'Tạo mới', href: `/${ws.id}/finance/transactions/new` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [description, setDescription] = useState<string>('');
  const [takenAt, setTakenAt] = useState<Date>(new Date());
  const [amount, setAmount] = useState<number>(0);

  const [originWallet, setOriginWallet] = useState<Wallet | null>(null);
  const [destinationWallet, setDestinationWallet] = useState<Wallet | null>(
    null
  );

  const [category, setCategory] = useState<TransactionCategory | null>(null);

  const [type, setType] = useState<'default' | 'transfer' | 'balance'>(
    'default'
  );

  useEffect(() => {
    if (!category || type !== 'default') return;
    setAmount((oldAmount) =>
      category?.is_expense === false
        ? Math.abs(oldAmount)
        : -Math.abs(oldAmount)
    );
  }, [category, type, amount]);

  const hasRequiredFields = () =>
    (type !== 'balance' ? amount != 0 : amount !== originWallet?.balance) &&
    (type === 'transfer' ? originWallet && destinationWallet : originWallet);

  const showCreateModal = () => {
    if (!ws || !originWallet?.id || originWallet?.balance == null) return;
    if (type === 'transfer' && !destinationWallet) return;

    openModal({
      title: <div className="font-semibold">Tạo giao dịch mới</div>,
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
              amount,
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
                type === 'balance' ? amount - originWallet.balance : amount,
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
      setAmount(originWallet?.balance || 0);
      setDescription('Cân bằng số dư');
    } else {
      setAmount(0);
      setDescription('');
      setDestinationWallet(null);
    }
  }, [type, originWallet?.balance]);

  return (
    <>
      <HeaderX label="Giao dịch – Tài chính" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
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
              Tạo mới
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
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
                Mặc định
              </Chip>
              <Chip variant="light" value="transfer">
                Chuyển tiền
              </Chip>
              <Chip variant="light" value="balance">
                Cân bằng số dư
              </Chip>
            </div>
          </Chip.Group>

          <SettingItemCard
            title="Nguồn tiền gốc"
            description={
              type === 'transfer'
                ? 'Nguồn tiền cần rút tiền.'
                : 'Nguồn tiền thực hiện giao dịch.'
            }
          >
            <div className="grid gap-2">
              <WalletSelector
                wallet={originWallet}
                setWallet={(wallet) => {
                  if (type === 'balance') setAmount(wallet?.balance || 0);
                  setOriginWallet(wallet);
                }}
                blacklist={destinationWallet ? [destinationWallet.id] : []}
                hideLabel
              />

              {type === 'transfer' && originWallet && amount ? (
                <>
                  <Divider variant="dashed" />
                  <div className="text-zinc-400">
                    Giao dịch này sẽ{' '}
                    <span className="font-semibold text-zinc-200">
                      {Intl.NumberFormat(lang, {
                        style: 'currency',
                        currency: originWallet.currency,
                        signDisplay: 'always',
                      }).format(amount * -1)}
                    </span>{' '}
                    với số dư hiện tại.
                  </div>
                </>
              ) : null}
            </div>
          </SettingItemCard>

          {type === 'transfer' ? (
            <SettingItemCard
              title="Nguồn tiền đích"
              description="Nguồn tiền cần nhận tiền."
            >
              <div className="grid gap-2">
                <WalletSelector
                  wallet={destinationWallet}
                  setWallet={setDestinationWallet}
                  blacklist={originWallet ? [originWallet.id] : []}
                  preventPreselected
                  disableQuery
                  clearable
                  hideLabel
                />

                {destinationWallet && amount ? (
                  <>
                    <Divider variant="dashed" />
                    <div className="text-zinc-400">
                      Giao dịch này sẽ{' '}
                      <span className="font-semibold text-zinc-200">
                        {Intl.NumberFormat(lang, {
                          style: 'currency',
                          currency: destinationWallet.currency,
                          signDisplay: 'always',
                        }).format(amount)}
                      </span>{' '}
                      với số dư hiện tại.
                    </div>
                  </>
                ) : null}
              </div>
            </SettingItemCard>
          ) : (
            <SettingItemCard
              title="Nội dung"
              description="Nội dung của giao dịch này."
              disabled={!originWallet}
            >
              <TextInput
                placeholder="Nhập nội dung"
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                disabled={!originWallet}
              />
            </SettingItemCard>
          )}

          <SettingItemCard
            title="Thời điểm giao dịch"
            description="Thời điểm giao dịch này được thực hiện."
            disabled={!originWallet}
          >
            <DateTimePicker
              value={takenAt}
              onChange={(date) => setTakenAt(date || new Date())}
              className="w-full"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              disabled={!originWallet}
              valueFormat="HH:mm - dddd, DD/MM/YYYY"
              locale={lang}
            />
          </SettingItemCard>

          <SettingItemCard
            title={
              type === 'balance' ? 'Tiền trong nguồn tiền' : 'Số tiền giao dịch'
            }
            description={
              type === 'balance'
                ? 'Số tiền trong nguồn tiền sau khi giao dịch.'
                : 'Số tiền giao dịch này được thực hiện.'
            }
            disabled={!originWallet}
          >
            <div className="grid gap-2">
              <NumberInput
                placeholder="Nhập số tiền"
                value={amount}
                onChange={(num) =>
                  category
                    ? setAmount(
                        Number(num) *
                          (type === 'default'
                            ? category?.is_expense === false
                              ? 1
                              : -1
                            : 1)
                      )
                    : setAmount(Number(num))
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

              {amount != 0 && (
                <>
                  <Divider variant="dashed" />

                  <div>
                    <div className="font-semibold text-zinc-200">
                      Đề xuất thông minh
                    </div>

                    <div>
                      Chuyển{' '}
                      <span className="font-semibold text-blue-300">
                        {Intl.NumberFormat(lang, {
                          style: 'decimal',
                        }).format(Math.abs(amount))}
                      </span>{' '}
                      thành những số tiền sau:
                    </div>
                  </div>

                  {Math.abs(amount) <= 1000 * 1000 * 1000 && (
                    <>
                      <div className="font-semibold text-zinc-200">Lớn hơn</div>
                      <div className="flex flex-wrap gap-2 font-semibold">
                        {Math.abs(amount) <= 1000 * 1000 * 1000 && (
                          <Chip
                            onClick={() => setAmount(Math.abs(amount * 10))}
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount * 10))}
                          </Chip>
                        )}

                        {Math.abs(amount) <= 1000 * 1000 * 100 && (
                          <Chip
                            checked={false}
                            onClick={() => setAmount(Math.abs(amount * 100))}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount * 100))}
                          </Chip>
                        )}

                        {Math.abs(amount) <= 1000 * 1000 * 10 && (
                          <Chip
                            onClick={() => setAmount(Math.abs(amount * 1000))}
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount * 1000))}
                          </Chip>
                        )}

                        {Math.abs(amount) <= 1000 * 1000 && (
                          <Chip
                            onClick={() =>
                              setAmount(Math.abs(amount * 1000 * 10))
                            }
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount * 1000 * 10))}
                          </Chip>
                        )}

                        {Math.abs(amount) <= 1000 * 100 && (
                          <Chip
                            onClick={() =>
                              setAmount(Math.abs(amount * 1000 * 100))
                            }
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount * 1000 * 100))}
                          </Chip>
                        )}

                        {Math.abs(amount) <= 1000 * 10 && (
                          <Chip
                            onClick={() =>
                              setAmount(Math.abs(amount * 1000 * 1000))
                            }
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount * 1000 * 1000))}
                          </Chip>
                        )}
                      </div>
                    </>
                  )}

                  {Math.round(amount / 10) === amount / 10 && (
                    <>
                      <div className="font-semibold text-zinc-200">Nhỏ hơn</div>
                      <div className="flex flex-wrap gap-2 font-semibold">
                        {Math.round(amount / 1000 / 1000) ===
                          amount / 1000 / 1000 && (
                          <Chip
                            onClick={() =>
                              setAmount(Math.abs(amount / 1000 / 1000))
                            }
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount / 1000 / 1000))}
                          </Chip>
                        )}

                        {Math.round(amount / 1000 / 100) ===
                          amount / 1000 / 100 && (
                          <Chip
                            onClick={() =>
                              setAmount(Math.abs(amount / 1000 / 100))
                            }
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount / 1000 / 100))}
                          </Chip>
                        )}

                        {Math.round(amount / 1000 / 10) ===
                          amount / 1000 / 10 && (
                          <Chip
                            onClick={() =>
                              setAmount(Math.abs(amount / 1000 / 10))
                            }
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount / 1000 / 10))}
                          </Chip>
                        )}

                        {Math.round(amount / 1000) === amount / 1000 && (
                          <Chip
                            onClick={() => setAmount(Math.abs(amount / 1000))}
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount / 1000))}
                          </Chip>
                        )}

                        {Math.round(amount / 100) === amount / 100 && (
                          <Chip
                            onClick={() => setAmount(Math.abs(amount / 100))}
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount / 100))}
                          </Chip>
                        )}

                        {Math.round(amount / 10) === amount / 10 && (
                          <Chip
                            onClick={() => setAmount(Math.abs(amount / 10))}
                            checked={false}
                          >
                            {Intl.NumberFormat(lang, {
                              style: 'decimal',
                            }).format(Math.abs(amount / 10))}
                          </Chip>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {type === 'balance' && originWallet?.balance != null && (
                <>
                  <Divider variant="dashed" />

                  <div>
                    Giao dịch này sẽ{' '}
                    <span className="font-semibold text-zinc-200">
                      {Intl.NumberFormat(lang, {
                        style: 'currency',
                        currency: originWallet.currency,
                        signDisplay: 'always',
                      }).format(amount - originWallet.balance)}
                    </span>{' '}
                    với số dư hiện tại trong nguồn tiền.
                  </div>
                </>
              )}
            </div>
          </SettingItemCard>

          <SettingItemCard
            title="Danh mục giao dịch"
            description="Loại giao dịch được thực hiện."
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
              disabled={type !== 'default'}
              setCategory={setCategory}
              hideLabel
            />
          </SettingItemCard>

          <SettingItemCard
            title="Đơn vị tiền tệ"
            description="Đơn vị tiền tệ sẽ được sử dụng để hiển thị số tiền."
          >
            <Select
              placeholder="Chờ chọn nguồn tiền..."
              value={originWallet?.currency}
              data={[
                {
                  label: 'Việt Nam Đồng (VND)',
                  value: 'VND',
                },
              ]}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
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
