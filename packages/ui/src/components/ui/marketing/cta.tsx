import { cn } from '@tuturuuu/utils/format';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { getMarketingAccent, type MarketingAccent } from './accents';

type AnchorProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'className' | 'href'
>;

interface CtaLinkProps extends AnchorProps {
  href: string;
  children: ReactNode;
  /** Opens in a new tab with the matching `rel` hardening. */
  external?: boolean;
  /** Stretches to the container on small screens; `auto` never does. */
  width?: 'responsive' | 'auto';
  size?: 'md' | 'lg';
  className?: string;
}

const sizes = {
  md: 'h-11 px-6 text-sm',
  lg: 'h-12 px-8',
} as const;

function externalProps(external?: boolean) {
  return external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

/**
 * Filled gradient call to action with a sheen that sweeps on hover.
 *
 * The sweep is a translated pseudo-layer rather than an animated
 * `background-position`, so it composites on the GPU and does not repaint the
 * button's text on every frame.
 */
export function PrimaryCta({
  href,
  children,
  accent = 'purple',
  external,
  width = 'responsive',
  size = 'lg',
  className,
  ...props
}: CtaLinkProps & { accent?: MarketingAccent }) {
  return (
    <a
      className={cn(
        'group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r font-medium text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        width === 'responsive' && 'w-full sm:w-auto',
        sizes[size],
        getMarketingAccent(accent).gradient,
        className
      )}
      href={href}
      {...externalProps(external)}
      {...props}
    >
      <span
        aria-hidden
        className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.3),transparent)] transition-transform duration-700 group-hover:translate-x-full motion-reduce:hidden"
      />
      <span className="relative flex items-center gap-2">{children}</span>
    </a>
  );
}

/** Quiet, glassy counterpart to `PrimaryCta`. */
export function SecondaryCta({
  href,
  children,
  external,
  width = 'responsive',
  size = 'lg',
  className,
  ...props
}: CtaLinkProps) {
  return (
    <a
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full border border-foreground/12 bg-background/40 font-medium text-foreground/75 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        width === 'responsive' && 'w-full sm:w-auto',
        sizes[size],
        className
      )}
      href={href}
      {...externalProps(external)}
      {...props}
    >
      {children}
    </a>
  );
}

/** Rounded pill label used above hero headlines and inside product frames. */
export function MarketingPill({
  accent = 'purple',
  icon: Icon,
  children,
  className,
}: {
  accent?: MarketingAccent;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/40 py-1.5 pr-4 pl-2.5 font-mono-ui text-[0.65rem] uppercase tracking-[0.2em] backdrop-blur-md',
        getMarketingAccent(accent).text,
        className
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

/**
 * The marketing nav's filled action button.
 *
 * Lives here rather than in `marketing-nav.tsx` so it stays a server component:
 * the nav itself is `'use client'` (it tracks scroll), but the action is often
 * rendered inside a `<Suspense>` boundary on the server and passed in as a
 * slot.
 */
export function MarketingNavAction({
  accent = 'purple',
  href,
  label,
}: {
  accent?: MarketingAccent;
  href: string;
  label: string;
}) {
  return (
    <a
      className={cn(
        'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r px-4 font-medium text-sm text-white shadow-sm transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        getMarketingAccent(accent).gradient
      )}
      href={href}
    >
      {label}
    </a>
  );
}
