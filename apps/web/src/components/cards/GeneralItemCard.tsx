import { Divider } from '@mantine/core';
import Link from 'next/link';
import useSWR from 'swr';

interface Props {
  name?: string;
  href?: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  hint?: string;

  amountOptions?: Intl.NumberFormatOptions;
  amountTrailing?: string;

  amountFetchPath?: string;
  batchAmountFetchPath?: string;
  productAmountFetchPath?: string;
  secondaryLabelFetchPath?: string;
  tertiaryLabelFetchPath?: string;

  showHint?: boolean;
  showAmount?: boolean;
  showSecondaryLabel?: boolean;
  showTertiaryLabel?: boolean;
}

const GeneralItemCard = ({
  name,
  href,
  secondaryLabel,
  tertiaryLabel,
  hint,

  amountOptions = { style: 'decimal' },
  amountTrailing = '',

  amountFetchPath,
  batchAmountFetchPath,
  productAmountFetchPath,
  secondaryLabelFetchPath,
  tertiaryLabelFetchPath,

  showHint = false,
  showAmount = false,
  showSecondaryLabel = false,
  showTertiaryLabel = false,
}: Props) => {
  const { data: secondaryLabelData } = useSWR(
    showSecondaryLabel && secondaryLabelFetchPath
      ? secondaryLabelFetchPath
      : null
  );

  const { data: tertiaryLabelData } = useSWR(
    showTertiaryLabel && tertiaryLabelFetchPath ? tertiaryLabelFetchPath : null
  );

  const { data: amountData } = useSWR(
    showAmount && amountFetchPath ? amountFetchPath : null
  );

  const { data: batchData } = useSWR(
    showAmount && batchAmountFetchPath ? batchAmountFetchPath : null
  );

  const { data: productData } = useSWR(
    showAmount && productAmountFetchPath ? productAmountFetchPath : null
  );

  const secondLabel = secondaryLabel || secondaryLabelData?.name;
  const thirdLabel = tertiaryLabel || tertiaryLabelData?.name;

  return (
    <Link
      href={href || '#'}
      className="group flex flex-col items-center justify-start rounded-lg border border-zinc-700/80 bg-zinc-800/70 text-center transition hover:bg-zinc-800"
    >
      <div className="flex h-full w-full items-center justify-center p-2 text-center">
        <div className="line-clamp-1 font-semibold tracking-wide">
          {name}{' '}
          {showHint && hint && <span className="text-blue-300">({hint})</span>}
        </div>
      </div>

      {showAmount && (
        <>
          <Divider className="w-full border-zinc-700" />
          <div className="grid h-full w-full gap-2 p-2">
            {!amountData?.count && !batchData?.count && !productData?.count && (
              <div className="flex h-full items-center justify-center rounded border border-zinc-300/20 bg-zinc-300/10 p-2 text-center font-semibold text-zinc-300">
                Trống
              </div>
            )}

            {amountData?.count != null && (
              <div className="flex h-full items-center justify-center gap-1 rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300">
                {Intl.NumberFormat('vi-VN', amountOptions).format(
                  amountData?.count || 0
                )}{' '}
                {amountTrailing}
              </div>
            )}

            {batchData?.count != null && (
              <div className="flex h-full items-center justify-center gap-1 rounded border border-green-300/20 bg-green-300/10 p-2 font-semibold text-green-300">
                {Intl.NumberFormat('vi-VN', {
                  style: 'decimal',
                }).format(batchData?.count || 0)}{' '}
                <span className="opacity-75">lô hàng</span>
              </div>
            )}

            {productData?.count != null && (
              <div className="flex h-full items-center justify-center gap-1 rounded border border-purple-300/20 bg-purple-300/10 p-2 font-semibold text-purple-300">
                {Intl.NumberFormat('vi-VN', {
                  style: 'decimal',
                }).format(productData?.count || 0)}{' '}
                <span className="opacity-75">sản phẩm</span>
              </div>
            )}
          </div>
        </>
      )}

      {showSecondaryLabel && secondLabel && (
        <>
          <Divider variant="dashed" className="w-full border-zinc-700" />
          <div className="h-full w-full p-2">
            <div className="line-clamp-3 flex h-full items-center justify-center gap-1 rounded border border-orange-300/20 bg-orange-300/10 p-2 font-semibold text-orange-300">
              {secondLabel}
            </div>
          </div>
        </>
      )}

      {showTertiaryLabel && thirdLabel && (
        <>
          <Divider variant="dashed" className="w-full border-zinc-700" />
          <div className="h-full w-full p-2">
            <div className="line-clamp-3 flex h-full items-center justify-center gap-1 rounded border border-green-300/20 bg-green-300/10 p-2 font-semibold text-green-300">
              {thirdLabel}
            </div>
          </div>
        </>
      )}
    </Link>
  );
};

export default GeneralItemCard;
