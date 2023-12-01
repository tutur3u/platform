import { Divider } from '@mantine/core';
import Link from 'next/link';

interface Props {
  name: string;
  description?: string;
  href: string;
  value?: number;
  isPercent?: boolean;
  maxPerDay?: number;
  maxPerMonth?: number;
  startDate?: Date;
  endDate?: Date;

  showValue?: boolean;
  showDescription?: boolean;
  showLimits?: boolean;
  showStartDate?: boolean;
  showEndDate?: boolean;
}

const PromotionCard = ({
  name,
  description = 'dshas djashd dsbd',
  href,
  value = 0,
  isPercent,
  maxPerDay,
  maxPerMonth,
  startDate = new Date(),
  endDate = new Date(new Date().setMonth(new Date().getMonth() + 1)),

  showDescription = false,
  showLimits = false,
  showStartDate = false,
  showEndDate = false,
}: Props) => {
  return (
    <Link
      href={href}
      className="border-border group flex flex-col items-center justify-start rounded-lg border bg-zinc-500/5 text-center transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
    >
      <div className="p-2">
        <div className="line-clamp-1 font-semibold tracking-wide">{name}</div>
        {showDescription && (
          <div className="text-foreground/80 line-clamp-1 font-semibold dark:text-zinc-400/70">
            {description}
          </div>
        )}
      </div>

      <Divider className="border-border w-full dark:border-zinc-700" />
      <div className="grid h-full w-full gap-2 p-2">
        <div className="flex h-full items-center justify-center gap-1 rounded border border-purple-500/20 bg-purple-500/10 p-2 font-semibold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
          <span className="opacity-75">Giảm</span>{' '}
          {isPercent
            ? `${value}%`
            : Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(value)}{' '}
        </div>
        {showLimits && maxPerDay && (
          <div className="flex h-full items-center justify-center gap-1 rounded border border-orange-300/20 bg-orange-300/10 p-2 font-semibold text-orange-300">
            <span className="opacity-75">Tối đa</span>{' '}
            {Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(maxPerDay)}{' '}
            <span className="opacity-75">/ ngày</span>
          </div>
        )}
        {showLimits && maxPerMonth && (
          <div className="line-clamp-1 flex h-full items-center justify-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-600 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300">
            <span className="opacity-75">Tối đa</span>{' '}
            {Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(maxPerMonth)}{' '}
            <span className="opacity-75">/ tháng</span>
          </div>
        )}
      </div>
      {(showStartDate || showEndDate) && (
        <>
          <Divider className="border-border w-full dark:border-zinc-700" />
          <div
            className={`grid w-full gap-2 p-2 ${
              showStartDate && showEndDate ? 'md:grid-cols-2' : ''
            }`}
          >
            {showStartDate && startDate != null && (
              <div className="gap-1 rounded border border-green-300/20 bg-green-300/10 p-2 font-semibold text-green-300">
                {startDate.toLocaleDateString('vi-VN')}
              </div>
            )}
            {showEndDate && endDate != null && (
              <div className="gap-1 rounded border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300">
                {endDate.toLocaleDateString('vi-VN')}
              </div>
            )}
          </div>
        </>
      )}
    </Link>
  );
};

export default PromotionCard;
