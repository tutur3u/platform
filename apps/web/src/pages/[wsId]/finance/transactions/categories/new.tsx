import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, Select, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../../components/settings/SettingItemCard';
import TransactionCategoryCreateModal from '../../../../../components/loaders/transactions/categories/TransactionCategoryCreateModal';
import { useLocalStorage } from '@mantine/hooks';

export const getServerSideProps = enforceHasWorkspaces;

const NewTransactionCategoryPage: PageWithLayoutProps = () => {
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
              content: 'Danh mục giao dịch',
              href: `/${ws.id}/finance/transactions/categories`,
            },
            {
              content: 'Tạo mới',
              href: `/${ws.id}/finance/transactions/categories/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');

  const [isExpense, setIsExpense] = useLocalStorage<boolean>({
    key: 'new-transaction-category-is-expense',
    defaultValue: true,
  });

  const hasRequiredFields = () => name.length > 0;

  const showCreateModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo danh mục giao dịch mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <TransactionCategoryCreateModal
          wsId={ws.id}
          category={{
            name,
            is_expense: isExpense,
          }}
        />
      ),
    });
  };

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
            <Divider className="my-2" variant="dashed" />
          </div>

          <SettingItemCard
            title="Tên danh mục giao dịch"
            description="Tên danh mục giao dịch sẽ được hiển thị trên giao diện người dùng."
          >
            <TextInput
              placeholder="Nhập tên danh mục giao dịch"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </SettingItemCard>

          <SettingItemCard
            title="Loại giao dịch"
            description="Quyết định danh mục giao dịch này có phải là danh mục thu hay chi."
          >
            <Select
              placeholder="Chọn loại giao dịch"
              value={isExpense ? 'expense' : 'income'}
              onChange={(e) => setIsExpense(e === 'expense')}
              data={[
                { label: 'Chi tiêu', value: 'expense' },
                { label: 'Thu nhập', value: 'income' },
              ]}
            />
          </SettingItemCard>

          <SettingItemCard
            title="Biểu tượng đại diện"
            description="Biểu tượng đại diện sẽ được hiển thị cùng với tên danh mục giao dịch."
            disabled
            comingSoon
          />
        </div>
      </div>
    </>
  );
};

NewTransactionCategoryPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewTransactionCategoryPage;
