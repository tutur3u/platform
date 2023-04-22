import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import {
  Divider,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../components/settings/SettingItemCard';
import WalletCreateModal from '../../../../components/loaders/wallets/WalletCreateModal';

export const getServerSideProps = enforceHasWorkspaces;

const NewWalletPage: PageWithLayoutProps = () => {
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
              content: 'Nguồn tiền',
              href: `/${ws.id}/finance/wallets`,
            },
            {
              content: 'Tạo mới',
              href: `/${ws.id}/finance/wallets/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [balance, setBalance] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('VND');
  const [type, setType] = useState<string>('STANDARD');

  const [statementDate, setStatementDate] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<number>(0);
  const [limit, setLimit] = useState<number | ''>('');

  const hasRequiredFields = () =>
    (name.length > 0 && type === 'STANDARD') ||
    (type === 'CREDIT' &&
      (limit || 0) > 0 &&
      statementDate > 0 &&
      paymentDate > 0);

  const showLoaderModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo nguồn tiền mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <WalletCreateModal
          wsId={ws.id}
          wallet={{
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

  return (
    <>
      <HeaderX label="Nguồn tiền – Tài chính" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end">
            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showLoaderModal : undefined}
            >
              Tạo mới
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
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={type === 'STANDARD' ? 'Số tiền hiện có' : 'Số tiền khả dụng'}
            description={
              type === 'STANDARD'
                ? 'Số tiền hiện có trong nguồn tiền này.'
                : 'Số tiền có thể sử dụng trong nguồn tiền này.'
            }
          >
            <NumberInput
              placeholder="Nhập số tiền"
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

            {type === 'CREDIT' && (limit || 0) - balance != 0 && (
              <div
                className={`mt-2 text-sm ${
                  (limit || 0) - balance > 0 ? 'text-red-300' : 'text-green-300'
                }`}
              >
                Bạn đang {(limit || 0) - balance > 0 ? 'nợ' : 'dư'}{' '}
                <span className="font-semibold">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: currency,
                  }).format(Math.abs((limit || 0) - balance))}
                </span>{' '}
                trong nguồn tiền này.
              </div>
            )}
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
              minRows={3}
              maxRows={5}
            />
          </SettingItemCard>

          <SettingItemCard
            title="Loại nguồn tiền"
            description="Quyết định cách thức sử dụng nguồn tiền này."
          >
            <div className="grid gap-2">
              <Select
                placeholder="Chọn loại nguồn tiền"
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
                    label: 'Tiêu chuẩn',
                    value: 'STANDARD',
                  },
                  {
                    label: 'Tín dụng',
                    value: 'CREDIT',
                  },
                ]}
                required
              />

              {type === 'CREDIT' && (
                <>
                  <NumberInput
                    label="Hạn mức tín dụng"
                    placeholder="Nhập hạn mức tín dụng"
                    value={limit}
                    onChange={(num) => {
                      setLimit(Number(num));
                      setBalance(Number(num));
                    }}
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
                      label="Ngày sao kê"
                      placeholder="Chọn ngày sao kê"
                      value={statementDate.toString()}
                      onChange={(e) => setStatementDate(Number(e))}
                      data={Array.from({ length: 28 }, (_, i) => ({
                        label: `${i + 1}`,
                        value: `${i + 1}`,
                      }))}
                      className="w-full"
                    />

                    <Select
                      label="Ngày thanh toán"
                      placeholder="Chọn ngày thanh toán"
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

NewWalletPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewWalletPage;
