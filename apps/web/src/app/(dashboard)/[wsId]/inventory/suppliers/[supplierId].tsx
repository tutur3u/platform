import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Divider, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { openModal } from '@mantine/modals';
import SupplierEditModal from '../../../../../components/loaders/suppliers/SupplierEditModal';
import SupplierDeleteModal from '../../../../../components/loaders/suppliers/SupplierDeleteModal';
import { ProductSupplier } from '../../../../../types/primitives/ProductSupplier';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const SupplierDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { supplierId } = router.query;

  const supplierApiPath =
    ws && supplierId
      ? `/api/workspaces/${ws.id}/inventory/suppliers/${supplierId}`
      : null;

  const { data: supplier } = useSWR<ProductSupplier>(supplierApiPath);

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Kho hàng', href: `/${ws.id}/inventory` },
            {
              content: 'Sản phẩm',
              href: `/${ws.id}/inventory/suppliers`,
            },
            {
              content: supplier?.name || 'Không có tên',
              href: `/${ws.id}/inventory/suppliers/${supplierId}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, supplier, supplierId, setRootSegment]);

  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (supplier) {
      setName(supplier?.name || '');
    }
  }, [supplier]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!supplier || !ws) return;
    if (typeof supplierId !== 'string') return;

    openModal({
      title: <div className="font-semibold">Cập nhật đơn vị tính</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <SupplierEditModal
          wsId={ws.id}
          oldSupplier={supplier}
          supplier={{
            id: supplierId,
            name,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!supplier || !ws) return;
    if (typeof supplierId !== 'string') return;

    openModal({
      title: <div className="font-semibold">Xóa đơn vị tính</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <SupplierDeleteModal wsId={ws.id} supplierId={supplierId} />,
    });
  };

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col ">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                supplier
                  ? 'hover:bg-red-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={supplier ? showDeleteModal : undefined}
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
        <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <TextInput
            label="Tên sản phẩm"
            placeholder='Ví dụ: "Paracetamol 500mg"'
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            disabled={!supplier}
          />
        </div>
      </div>
    </>
  );
};

SupplierDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default SupplierDetailsPage;
