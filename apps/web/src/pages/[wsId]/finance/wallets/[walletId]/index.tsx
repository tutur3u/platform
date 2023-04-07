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

export const getServerSideProps = enforceHasWorkspaces;

const WalletDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

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
              content: ws?.name || 'Tổ chức không tên',
              href: `/${wsId}`,
            },
            { content: 'Tài chính', href: `/${wsId}/finance` },
            {
              content: 'Nguồn tiền',
              href: `/${wsId}/finance/wallets`,
            },
            {
              content: wallet?.name || 'Nguồn tiền không tên',
              href: `/${wsId}/finance/wallets/${walletId}`,
            },
            {
              content: 'Thông tin',
              href: `/${wsId}/finance/wallets/${walletId}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [wsId, walletId, ws, wallet, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [balance, setBalance] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('VND');

  useEffect(() => {
    if (!wallet) return;
    setName(wallet?.name || '');
    setDescription(wallet?.description || '');
    setBalance(wallet?.balance || 0);
    setCurrency(wallet?.currency || 'VND');
  }, [wallet]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!wallet) return;
    if (typeof walletId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Cập nhật nguồn tiền</div>,
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
      title: <div className="font-semibold">Xóa nguồn tiền</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <WalletDeleteModal wsId={ws.id} walletId={walletId} />,
    });
  };

  return (
    <>
      <HeaderX label="Nguồn tiền – Tài chính" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                wallet ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
              }`}
              onClick={wallet ? showDeleteModal : undefined}
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
            title="Tên nguồn tiền"
            description="Tên nguồn tiền sẽ được hiển thị trên bảng điều khiển."
          >
            <TextInput
              placeholder="Nhập tên nguồn tiền"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title="Số tiền hiện có"
            description="Số tiền hiện có trong nguồn tiền này."
          >
            <NumberInput
              placeholder="Nhập số tiền"
              value={balance}
              onChange={(num) => setBalance(Number(num))}
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
            />
          </SettingItemCard>

          <SettingItemCard
            title="Đơn vị tiền tệ"
            description="Đơn vị tiền tệ sẽ được sử dụng để hiển thị số tiền."
          >
            <Select
              placeholder="Chọn đơn vị tiền tệ"
              value={currency}
              onChange={(e) => setCurrency(e || 'VND')}
              data={[
                {
                  label: 'Việt Nam Đồng (VND)',
                  value: 'VND',
                },
              ]}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
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
            />
          </SettingItemCard>

          <SettingItemCard
            title="Biểu tượng đại diện"
            description="Biểu tượng đại diện sẽ được hiển thị cùng với tên nguồn tiền."
            disabled
            comingSoon
          />
        </div>
      </div>
    </>
  );
};

WalletDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="wallet_details">{page}</NestedLayout>;
};

export default WalletDetailsPage;
