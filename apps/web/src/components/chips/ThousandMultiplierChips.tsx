import { Chip, Divider } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  amount: number;
  setAmount: (amount: number) => void;

  hidden?: boolean;
}

const ThousandMultiplierChips = ({
  amount,
  setAmount,
  hidden = false,
}: Props) => {
  const { lang } = useTranslation();

  if (hidden) return null;

  return (
    <>
      <Divider variant="dashed" />
      <div>
        <div className="font-semibold text-zinc-200">Đề xuất thông minh</div>

        <div>
          Chuyển{' '}
          <span className="font-semibold text-blue-300">
            {Intl.NumberFormat(lang, {
              style: 'decimal',
            }).format(Math.abs(amount))}
          </span>{' '}
          thành những số tiền sau:
        </div>
      </div>

      {Math.abs(amount) <= 1000 * 1000 * 1000 && (
        <>
          <div className="font-semibold text-zinc-200">Lớn hơn</div>
          <div className="flex flex-wrap gap-2 font-semibold">
            {Math.abs(amount) <= 1000 * 1000 * 1000 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount * 10))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount * 10))}
              </Chip>
            )}

            {Math.abs(amount) <= 1000 * 1000 * 100 && (
              <Chip
                checked={false}
                onClick={() => setAmount(Math.abs(amount * 100))}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount * 100))}
              </Chip>
            )}

            {Math.abs(amount) <= 1000 * 1000 * 10 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount * 1000))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount * 1000))}
              </Chip>
            )}

            {Math.abs(amount) <= 1000 * 1000 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount * 1000 * 10))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount * 1000 * 10))}
              </Chip>
            )}

            {Math.abs(amount) <= 1000 * 100 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount * 1000 * 100))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount * 1000 * 100))}
              </Chip>
            )}

            {Math.abs(amount) <= 1000 * 10 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount * 1000 * 1000))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount * 1000 * 1000))}
              </Chip>
            )}
          </div>
        </>
      )}

      {Math.round(amount / 10) === amount / 10 && (
        <>
          <div className="font-semibold text-zinc-200">Nhỏ hơn</div>
          <div className="flex flex-wrap gap-2 font-semibold">
            {Math.round(amount / 1000 / 1000) === amount / 1000 / 1000 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount / 1000 / 1000))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount / 1000 / 1000))}
              </Chip>
            )}

            {Math.round(amount / 1000 / 100) === amount / 1000 / 100 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount / 1000 / 100))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount / 1000 / 100))}
              </Chip>
            )}

            {Math.round(amount / 1000 / 10) === amount / 1000 / 10 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount / 1000 / 10))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount / 1000 / 10))}
              </Chip>
            )}

            {Math.round(amount / 1000) === amount / 1000 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount / 1000))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount / 1000))}
              </Chip>
            )}

            {Math.round(amount / 100) === amount / 100 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount / 100))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount / 100))}
              </Chip>
            )}

            {Math.round(amount / 10) === amount / 10 && (
              <Chip
                onClick={() => setAmount(Math.abs(amount / 10))}
                checked={false}
              >
                {Intl.NumberFormat(lang, {
                  style: 'decimal',
                }).format(Math.abs(amount / 10))}
              </Chip>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default ThousandMultiplierChips;
