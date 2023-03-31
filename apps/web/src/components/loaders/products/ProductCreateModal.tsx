import { Timeline } from '@mantine/core';
import { Product } from '../../../types/primitives/Product';
import { ProductPrice } from '../../../types/primitives/ProductPrice';
import { useEffect, useState } from 'react';
import {
  BanknotesIcon,
  CheckBadgeIcon,
  PlusIcon,
} from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Status } from '../status';

interface Props {
  wsId: string;
  product: Partial<Product>;
  prices: ProductPrice[];
}

interface Progress {
  createdProduct: Status;
  createdPrices: Status;
}

const ProductCreateModal = ({ wsId, product, prices }: Props) => {
  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    createdProduct: 'idle',
    createdPrices: 'idle',
  });

  const hasError =
    progress.createdProduct === 'error' || progress.createdPrices === 'error';

  const hasSuccess =
    progress.createdProduct === 'success' &&
    progress.createdPrices === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: 'Thành công',
        message: 'Đã tạo sản phẩm',
        color: 'green',
      });
  }, [hasSuccess]);

  const createProduct = async () => {
    const res = await fetch(`/api/workspaces/${wsId}/inventory/products`, {
      method: 'POST',
      body: JSON.stringify(product),
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, createdProduct: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo sản phẩm',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdProduct: 'error' }));
      return false;
    }
  };

  const createPrices = async (productId: string) => {
    if (prices.length === 0) {
      setProgress((progress) => ({ ...progress, createdPrices: 'success' }));
      return true;
    }

    const res = await fetch(
      `/api/workspaces/${wsId}/inventory/products/${productId}/prices`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prices),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, createdPrices: 'success' }));
      return true;
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo đơn giá',
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdPrices: 'error' }));
      return false;
    }
  };

  const [productId, setProductId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({ ...progress, createdProduct: 'loading' }));
    const productId = await createProduct();
    if (!productId) return;

    setProductId(productId);
    setProgress((progress) => ({ ...progress, createdPrices: 'loading' }));
    await createPrices(productId);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.createdPrices === 'success'
            ? 2
            : progress.createdProduct === 'success'
            ? 1
            : 0
        }
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title="Tạo sản phẩm"
        >
          {progress.createdProduct === 'success' ? (
            <div className="text-green-300">Đã tạo sản phẩm</div>
          ) : progress.createdProduct === 'error' ? (
            <div className="text-red-300">Không thể tạo sản phẩm</div>
          ) : progress.createdProduct === 'loading' ? (
            <div className="text-blue-300">Đang tạo sản phẩm</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ tạo sản phẩm</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`Thêm đơn giá (${prices?.length || 0})`}
        >
          {progress.createdProduct === 'success' ? (
            progress.createdPrices === 'success' ? (
              <div className="text-green-300">
                Đã thêm {prices.length} đơn giá
              </div>
            ) : progress.createdPrices === 'error' ? (
              <div className="text-red-300">Không thể thêm đơn giá</div>
            ) : progress.createdPrices === 'loading' ? (
              <div className="text-blue-300">
                Đang thêm {prices.length} đơn giá
              </div>
            ) : (
              <div className="text-zinc-400/80">Đang chờ thêm đơn giá</div>
            )
          ) : progress.createdProduct === 'error' ? (
            <div className="text-red-300">Đã huỷ thêm đơn giá</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ thêm sản phẩm</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title="Hoàn tất"
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.createdPrices === 'success' ? (
            <div className="text-green-300">Đã hoàn tất</div>
          ) : hasError ? (
            <div className="text-red-300">Đã huỷ hoàn tất</div>
          ) : (
            <div className="text-zinc-400/80">Đang chờ hoàn tất</div>
          )}
        </Timeline.Item>
      </Timeline>

      <div className="mt-4 flex justify-end gap-2">
        {started || (
          <button
            className="rounded border border-zinc-300/10 bg-zinc-300/10 px-4 py-1 font-semibold text-zinc-300 transition hover:bg-zinc-300/20"
            onClick={() => closeAllModals()}
          >
            Huỷ
          </button>
        )}

        {productId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/inventory/products/${productId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
          >
            Xem sản phẩm
          </Link>
        )}

        <button
          className={`rounded border px-4 py-1 font-semibold transition ${
            hasError
              ? 'border-red-300/10 bg-red-300/10 text-red-300 hover:bg-red-300/20'
              : hasSuccess
              ? 'border-green-300/10 bg-green-300/10 text-green-300 hover:bg-green-300/20'
              : started
              ? 'cursor-not-allowed border-zinc-300/10 bg-zinc-300/10 text-zinc-300/50'
              : 'border-blue-300/10 bg-blue-300/10 text-blue-300 hover:bg-blue-300/20'
          }`}
          onClick={() => {
            if (hasError) {
              closeAllModals();
              return;
            }

            if (hasSuccess) {
              router.push(`/${wsId}/inventory/products`);
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleCreate();
            }
          }}
        >
          {hasError
            ? 'Quay lại'
            : hasSuccess
            ? 'Hoàn tất'
            : started
            ? 'Đang tạo'
            : 'Bắt đầu'}
        </button>
      </div>
    </>
  );
};

export default ProductCreateModal;
