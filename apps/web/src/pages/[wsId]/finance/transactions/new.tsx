import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, NumberInput, Select, Textarea } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import WalletSelector from '../../../../components/selectors/WalletSelector';
import { Wallet } from '../../../../types/primitives/Wallet';
import SettingItemCard from '../../../../components/settings/SettingItemCard';
import TransactionCategorySelector from '../../../../components/selectors/TransactionCategorySelector';
import { TransactionCategory } from '../../../../types/primitives/TransactionCategory';
import TransactionCreateModal from '../../../../components/loaders/transactions/TransactionCreateModal';

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
  const [amount, setAmount] = useState<number>(0);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [category, setCategory] = useState<TransactionCategory | null>(null);

  const hasRequiredFields = () => amount != 0 && wallet;

  const showCreateModal = () => {
    if (!ws || !wallet?.id) return;
    openModal({
      title: <div className="font-semibold">Tạo giao dịch mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <TransactionCreateModal
          wsId={ws.id}
          walletId={wallet.id}
          transaction={{
            description,
            amount,
          }}
          redirectUrl={`/${ws.id}/finance/transactions`}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label="Giao dịch – Tài chính" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2 xl:gap-x-16">
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            <WalletSelector wallet={wallet} setWallet={setWallet} required />
            <TransactionCategorySelector
              category={category}
              setCategory={setCategory}
            />
          </div>
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
        <div className="grid h-fit gap-4 md:grid-cols-2">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <SettingItemCard
            title="Số tiền"
            description="Số tiền giao dịch này sẽ được thêm vào ví đã chọn."
          >
            <NumberInput
              placeholder="Nhập số tiền"
              value={amount}
              onChange={(num) => setAmount(Number(num))}
              className="w-full"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              min={0}
              parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
              formatter={(value) =>
                !Number.isNaN(parseFloat(value || ''))
                  ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  : ''
              }
              disabled={!wallet}
            />
          </SettingItemCard>

          <SettingItemCard
            title="Đơn vị tiền tệ"
            description="Đơn vị tiền tệ sẽ được sử dụng để hiển thị số tiền."
          >
            <Select
              placeholder="Chờ chọn ví..."
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

          <SettingItemCard
            title="Mô tả"
            description="Mô tả ngắn gọn về nguồn tiền này."
          >
            <Textarea
              placeholder="Nhập mô tả"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              minRows={3}
              maxRows={5}
              disabled={!wallet}
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
