import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Product } from '@/types/primitives/Product';
import { Divider } from '@mantine/core';
import Link from 'next/link';

interface Props {
  product: Product;
  showSupplier?: boolean;
  showCategory?: boolean;
  showAmount?: boolean;
  showPrice?: boolean;
}

const ProductCard = ({
  product,
  showSupplier = false,
  showCategory = false,
  showAmount = false,
  showPrice = false,
}: Props) => {
  const { ws } = useWorkspaces();
  if (!ws) return null;

  return (
    <Link
      href={`/${ws.id}/inventory/products/${product.id}`}
      className="border-border group flex flex-col items-center justify-center rounded-lg border bg-zinc-500/5 text-center transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {product.name}{' '}
            {product.unit && (
              <span className="lowercase text-blue-600 dark:text-blue-300">
                ({product.unit})
              </span>
            )}
          </div>
          {showSupplier && (
            <div className="text-foreground/80 line-clamp-1 font-semibold dark:text-zinc-400/70">
              {product.manufacturer}
            </div>
          )}
        </div>

        {(showAmount || showCategory) && (
          <>
            <Divider className="border-border w-full dark:border-zinc-700" />
            <div className="flex flex-col items-center justify-center gap-2 p-2">
              {showAmount && (
                <div className="line-clamp-1 w-full rounded border border-blue-500/20 bg-blue-500/10 px-4 py-0.5 font-semibold text-blue-500 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'decimal',
                  }).format(Number(product?.amount || 0))}{' '}
                  <span className="opacity-75">sản phẩm</span>
                </div>
              )}
              {showCategory && product?.category && (
                <div className="line-clamp-1 w-full rounded border border-orange-500/20 bg-orange-500/10 px-4 py-0.5 font-semibold text-orange-500 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300">
                  {product.category}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showPrice && (
        <>
          <Divider
            variant="dashed"
            className="border-border w-full dark:border-zinc-700"
          />
          <div className="w-full">
            <div
              className={`m-2 rounded border p-2 font-semibold ${
                product?.unit
                  ? 'border-purple-500/20 bg-purple-500/10 text-purple-500 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300'
                  : 'border-red-500/20 bg-red-500/10 text-red-500 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
              }`}
            >
              {product?.unit ? (
                <>
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                  }).format(Number(product?.price || 0))}{' '}
                  <span className="opacity-75">/ {product?.unit}</span>
                </>
              ) : (
                'Chưa thiết lập đơn giá'
              )}
            </div>
          </div>
        </>
      )}
    </Link>
  );
};

export default ProductCard;
