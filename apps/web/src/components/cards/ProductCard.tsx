import { Divider } from '@mantine/core';
import Link from 'next/link';
import { Product } from '../../types/primitives/Product';
import { useWorkspaces } from '../../hooks/useWorkspaces';

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
      className="group flex flex-col items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 text-center transition hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {product.name}{' '}
            {product.unit && (
              <span className="lowercase text-blue-300">({product.unit})</span>
            )}
          </div>
          {showSupplier && (
            <div className="line-clamp-1 font-semibold text-zinc-400/70">
              {product.manufacturer}
            </div>
          )}
        </div>

        {(showAmount || showCategory) && (
          <>
            <Divider className="w-full border-zinc-700" />
            <div className="flex flex-col items-center justify-center gap-2 p-2">
              {showAmount && (
                <div className="line-clamp-1 w-full rounded border border-blue-300/20 bg-blue-300/10 px-4 py-0.5 font-semibold text-blue-300">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'decimal',
                  }).format(product?.amount || 0)}{' '}
                  <span className="opacity-75">sản phẩm</span>
                </div>
              )}
              {showCategory && (
                <div className="line-clamp-1 w-full rounded border border-orange-300/20 bg-orange-300/10 px-4 py-0.5 font-semibold text-orange-300">
                  {product?.category}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showPrice && (
        <>
          <Divider variant="dashed" className="w-full border-zinc-700" />
          <div className="w-full">
            <div
              className={`m-2 rounded border p-2 font-semibold ${
                product?.unit
                  ? 'border-purple-300/20 bg-purple-300/10 text-purple-300'
                  : 'border-red-300/20 bg-red-300/10 text-red-300'
              }`}
            >
              {product?.unit ? (
                <>
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                  }).format(product?.price || 0)}{' '}
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
