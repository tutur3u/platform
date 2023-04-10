import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Button, Divider, NumberInput, Select, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import WalletSelector from '../../../../components/selectors/WalletSelector';
import { Wallet } from '../../../../types/primitives/Wallet';
import SettingItemCard from '../../../../components/settings/SettingItemCard';
import TransactionCategorySelector from '../../../../components/selectors/TransactionCategorySelector';
import { TransactionCategory } from '../../../../types/primitives/TransactionCategory';
import { useRouter } from 'next/router';
import { Transaction } from '../../../../types/primitives/Transaction';
import useSWR from 'swr';
import TransactionDeleteModal from '../../../../components/loaders/transactions/TransactionDeleteModal';
import TransactionEditModal from '../../../../components/loaders/transactions/TransactionEditModal';
import { DateTimePicker } from '@mantine/dates';
import useTranslation from 'next-translate/useTranslation';
import 'dayjs/locale/vi';
import moment from 'moment';
import { EyeIcon } from '@heroicons/react/24/outline';
import ThousandMultiplierChips from '../../../../components/chips/ThousandMultiplierChips';

export const getServerSideProps = enforceHasWorkspaces;

const TransactionDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
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
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Tài chính', href: `/${ws.id}/finance` },
            {
              content: 'Giao dịch',
              href: `/${ws.id}/finance/transactions`,
            },
            {
              content: transaction?.id || 'Đang tải...',
              href: `/${ws.id}/finance/transactions/${transaction?.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, transaction, setRootSegment]);

  const [description, setDescription] = useState<string>('');
  const [takenAt, setTakenAt] = useState<Date>(new Date());
  const [amount, setAmount] = useState<number>(0);

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
      title: <div className="font-semibold">Cập nhật giao dịch</div>,
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
      title: <div className="font-semibold">Xóa giao dịch</div>,
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
      <HeaderX label="Giao dịch – Tài chính" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
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
              Xoá
            </button>

            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showEditModal : undefined}
            >
              Lưu thay đổi
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <SettingItemCard
            title="Nguồn tiền"
            description="Nguồn tiền mà giao dịch này được thực hiện."
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
            title="Nội dung"
            description="Nội dung của giao dịch này."
            disabled={!wallet}
          >
            <TextInput
              placeholder="Nhập nội dung"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              disabled={!wallet}
            />
          </SettingItemCard>

          <SettingItemCard
            title="Thời điểm giao dịch"
            description="Thời điểm giao dịch này được thực hiện."
            disabled={!wallet}
          >
            <DateTimePicker
              value={takenAt}
              onChange={(date) => setTakenAt(date || new Date())}
              className="w-full"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              disabled={!wallet}
              valueFormat="HH:mm - dddd, DD/MM/YYYY"
              locale={lang}
            />
          </SettingItemCard>

          <SettingItemCard
            title="Số tiền giao dịch"
            description="Số tiền giao dịch này được thực hiện."
            disabled={!wallet}
          >
            <div className="grid gap-2">
              <NumberInput
                placeholder="Nhập số tiền"
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
            </div>
          </SettingItemCard>

          <SettingItemCard
            title="Danh mục giao dịch"
            description="Loại giao dịch được thực hiện."
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
            title="Đơn vị tiền tệ"
            description="Đơn vị tiền tệ sẽ được sử dụng để hiển thị số tiền."
          >
            <Select
              placeholder="Chờ chọn nguồn tiền..."
              value={wallet?.currency}
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

TransactionDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default TransactionDetailsPage;
