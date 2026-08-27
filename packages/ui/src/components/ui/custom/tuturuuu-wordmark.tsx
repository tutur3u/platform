import { cn } from '@tuturuuu/utils/format';
import { TuturuuLogo } from './tuturuuu-logo';

/**
 * The Tuturuuu product lockup: mark, then "Tuturuuu" over the product name.
 *
 * Two lines rather than one string. "Tuturuuu Forms" set on a single line reads
 * as one long product name; stacking it says what it is — a Tuturuuu product
 * called Forms — and keeps the company name consistent across products while
 * only the second line changes.
 *
 * The logo deliberately does not take a local `src`. Satellites are served from
 * their own domains and do not carry `/media`, so a local path 404s there; the
 * component's default is the absolute URL for exactly that reason.
 */
export function TuturuuuWordmark({
  className,
  product,
  size = 'md',
}: {
  className?: string;
  /** The second line — the product name, without "Tuturuuu" in front of it. */
  product: string;
  size?: 'sm' | 'md';
}) {
  const dimension = size === 'sm' ? 28 : 32;

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <TuturuuLogo
        alt=""
        aria-hidden
        className={cn('object-contain', size === 'sm' ? 'h-7 w-7' : 'h-8 w-8')}
        height={dimension}
        width={dimension}
      />
      <span className="flex flex-col text-left leading-none">
        <span
          className={cn(
            'uppercase tracking-[0.24em] opacity-70',
            size === 'sm' ? 'text-[9px]' : 'text-[10px]'
          )}
        >
          Tuturuuu
        </span>
        <span
          className={cn(
            'font-display font-semibold uppercase tracking-[0.08em]',
            size === 'sm' ? 'text-sm' : 'text-lg'
          )}
        >
          {product}
        </span>
      </span>
    </span>
  );
}
