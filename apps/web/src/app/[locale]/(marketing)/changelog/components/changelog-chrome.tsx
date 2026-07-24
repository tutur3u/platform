import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { type CategoryStyle, styleFor } from './changelog-data';

/**
 * The small parts every release wears: its category chip, its version plate
 * and its cover.
 *
 * All three used to be inline markup repeated between the index and the entry
 * page, with the version rendered as a `secondary` Radix badge in one place and
 * a bare span in the other.
 */

export function CategoryChip({
  category,
  className,
  label,
}: {
  category: string;
  className?: string;
  label: string;
}) {
  const style = styleFor(category);
  const Icon = style.icon;

  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono-ui text-[0.6rem] uppercase tracking-[0.14em]',
        style.chip,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * Version numbers are the one string on this page a reader scans for, so they
 * get the mono face and tabular figures rather than the body font.
 */
export function VersionPlate({
  className,
  version,
}: {
  className?: string;
  version: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-full border border-foreground/[0.09] bg-foreground/[0.03] px-2.5 py-1 font-mono-ui text-[0.6rem] text-foreground/55 tabular-nums tracking-[0.08em]',
        className
      )}
    >
      {version}
    </span>
  );
}

/**
 * Cover art, or a drawn stand-in when an entry has none.
 *
 * The stand-in matters: most entries ship without an image, and the old page
 * dropped a grey `Megaphone` into a muted box for those — which read as a
 * broken image more than a choice. This draws a tinted field carrying the
 * category's own icon, so an entry without art still looks authored.
 */
export function CoverArt({
  alt,
  category,
  className,
  priority = false,
  src,
}: {
  alt: string;
  category: string;
  className?: string;
  priority?: boolean;
  src: string | null;
}) {
  const style = styleFor(category);

  return (
    <div
      className={cn('relative overflow-hidden bg-foreground/[0.03]', className)}
    >
      {src ? (
        <Image
          alt={alt}
          className="object-cover"
          fill
          priority={priority}
          sizes="(min-width: 1024px) 42rem, 100vw"
          src={src}
          unoptimized
        />
      ) : (
        <DrawnCover style={style} />
      )}
    </div>
  );
}

function DrawnCover({ style }: { style: CategoryStyle }) {
  const Icon = style.icon;

  return (
    <div aria-hidden className="absolute inset-0">
      <span
        className={cn(
          'absolute -top-16 -right-10 h-56 w-56 rounded-full opacity-70 blur-3xl',
          style.glow
        )}
      />
      <span
        className="absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse 70% 70% at 50% 50%, black 10%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 70% at 50% 50%, black 10%, transparent 78%)',
        }}
      />
      <span className="absolute inset-0 grid place-items-center">
        <Icon className={cn('h-16 w-16 opacity-25', style.text)} />
      </span>
    </div>
  );
}
