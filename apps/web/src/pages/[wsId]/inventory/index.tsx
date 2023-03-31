import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { Divider } from '@mantine/core';
import Link from 'next/link';
import { useWorkspaces } from '../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const InventoryPage: PageWithLayoutProps = () => {
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
            { content: 'Kho hàng', href: `/${ws.id}/inventory` },
            {
              content: 'Tổng quan',
              href: `/${ws.id}/inventory`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  return (
    <>
      <HeaderX label="Tổng quan – Kho hàng" />
      <div className="grid flex-col gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/warehouse/attention"
          className="rounded-lg bg-yellow-300/10 transition duration-300 hover:-translate-y-1 hover:bg-yellow-300/20 lg:col-span-2"
        >
          <div className="p-2 text-center text-xl font-semibold text-yellow-300">
            Sản phẩm gần hết hàng
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-yellow-300/20 bg-yellow-300/20 p-4 font-semibold text-yellow-300">
            {true ? `${0} sản phẩm` : 'Đang tải'}
          </div>
        </Link>

        <Link
          href="/warehouse/attention"
          className="rounded-lg bg-red-300/10 transition duration-300 hover:-translate-y-1 hover:bg-red-300/20 lg:col-span-2"
        >
          <div className="p-2 text-center text-xl font-semibold text-red-300">
            Sản phẩm gần hết hạn sử dụng
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-red-300/20 bg-red-300/20 p-4 font-semibold text-red-300">
            {true ? `${0} sản phẩm` : 'Đang tải'}
          </div>
        </Link>

        <Divider className="col-span-full" variant="dashed" />

        <button className="rounded-lg bg-green-300/10 transition duration-300 hover:-translate-y-1 hover:bg-green-300/20 md:col-span-2">
          <div className="p-2 text-center text-xl font-semibold text-green-300">
            Mã giảm giá đang hoạt động
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-green-300/20 bg-green-300/20 p-4 text-xl font-semibold text-green-300">
            3 / 3
          </div>
        </button>

        <button className="rounded-lg bg-[#2c2b2b] transition duration-300 hover:-translate-y-1 hover:bg-zinc-600/40">
          <div className="p-2 text-center text-xl font-semibold">
            Tổng số lượng sản phẩm
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-zinc-300/20 bg-zinc-300/10 p-4 text-xl font-bold text-zinc-300">
            N/A
          </div>
        </button>

        <button className="rounded-lg bg-[#2c2b2b] transition duration-300 hover:-translate-y-1 hover:bg-zinc-600/40">
          <div className="p-2 text-center text-xl font-semibold">
            Tổng sản phẩm khác nhau
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-zinc-300/20 bg-zinc-300/10 p-4 text-xl font-bold text-zinc-300">
            N/A
          </div>
        </button>

        <button className="rounded-lg bg-[#2c2b2b] transition duration-300 hover:-translate-y-1 hover:bg-zinc-600/40">
          <div className="p-2 text-center text-xl font-semibold">
            Tổng danh mục sản phẩm
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-zinc-300/20 bg-zinc-300/10 p-4 text-xl font-bold text-zinc-300">
            N/A
          </div>
        </button>

        <button className="rounded-lg bg-[#2c2b2b] transition duration-300 hover:-translate-y-1 hover:bg-zinc-600/40">
          <div className="p-2 text-center text-xl font-semibold">
            Tổng lô hàng
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-zinc-300/20 bg-zinc-300/10 p-4 text-xl font-bold text-zinc-300">
            N/A
          </div>
        </button>

        <button className="rounded-lg bg-[#2c2b2b] transition duration-300 hover:-translate-y-1 hover:bg-zinc-600/40">
          <div className="p-2 text-center text-xl font-semibold">
            Tổng kho hàng
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-zinc-300/20 bg-zinc-300/10 p-4 text-xl font-bold text-zinc-300">
            N/A
          </div>
        </button>

        <button className="rounded-lg bg-[#2c2b2b] transition duration-300 hover:-translate-y-1 hover:bg-zinc-600/40">
          <div className="p-2 text-center text-xl font-semibold">
            Tổng mã giảm giá
          </div>
          <div className="m-4 mt-0 flex items-center justify-center rounded-lg border border-zinc-300/20 bg-zinc-300/10 p-4 text-xl font-bold text-zinc-300">
            N/A
          </div>
        </button>
      </div>
    </>
  );
};

InventoryPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="inventory">{page}</NestedLayout>;
};

export default InventoryPage;
