import { Globe } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps, ReactNode } from 'react';
import { type Locale, localeCookieName } from '../../lib/platform/locale';

export type Tone = {
  accent: string;
  badge: string;
  card: string;
  gradient: string;
  icon: string;
  iconBox: string;
};

export const tones = {
  blue: {
    accent: 'text-dynamic-blue',
    badge: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
    card: 'border-dynamic-blue/30 bg-dynamic-blue/10 hover:border-dynamic-blue/50',
    gradient: 'from-dynamic-blue to-dynamic-cyan',
    icon: 'text-dynamic-blue',
    iconBox: 'bg-dynamic-blue/10',
  },
  cyan: {
    accent: 'text-dynamic-cyan',
    badge: 'border-dynamic-cyan/20 bg-dynamic-cyan/10 text-dynamic-cyan',
    card: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 hover:border-dynamic-cyan/50',
    gradient: 'from-dynamic-cyan to-dynamic-blue',
    icon: 'text-dynamic-cyan',
    iconBox: 'bg-dynamic-cyan/10',
  },
  green: {
    accent: 'text-dynamic-green',
    badge: 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
    card: 'border-dynamic-green/30 bg-dynamic-green/10 hover:border-dynamic-green/50',
    gradient: 'from-dynamic-green to-dynamic-blue',
    icon: 'text-dynamic-green',
    iconBox: 'bg-dynamic-green/10',
  },
  orange: {
    accent: 'text-dynamic-orange',
    badge: 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
    card: 'border-dynamic-orange/30 bg-dynamic-orange/10 hover:border-dynamic-orange/50',
    gradient: 'from-dynamic-orange to-dynamic-red',
    icon: 'text-dynamic-orange',
    iconBox: 'bg-dynamic-orange/10',
  },
  pink: {
    accent: 'text-dynamic-pink',
    badge: 'border-dynamic-pink/20 bg-dynamic-pink/10 text-dynamic-pink',
    card: 'border-dynamic-pink/30 bg-dynamic-pink/10 hover:border-dynamic-pink/50',
    gradient: 'from-dynamic-pink to-dynamic-red',
    icon: 'text-dynamic-pink',
    iconBox: 'bg-dynamic-pink/10',
  },
  purple: {
    accent: 'text-dynamic-purple',
    badge: 'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
    card: 'border-dynamic-purple/30 bg-dynamic-purple/10 hover:border-dynamic-purple/50',
    gradient: 'from-dynamic-purple to-dynamic-pink',
    icon: 'text-dynamic-purple',
    iconBox: 'bg-dynamic-purple/10',
  },
  red: {
    accent: 'text-dynamic-red',
    badge: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
    card: 'border-dynamic-red/30 bg-dynamic-red/10 hover:border-dynamic-red/50',
    gradient: 'from-dynamic-red to-dynamic-purple',
    icon: 'text-dynamic-red',
    iconBox: 'bg-dynamic-red/10',
  },
  yellow: {
    accent: 'text-dynamic-yellow',
    badge: 'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
    card: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 hover:border-dynamic-yellow/50',
    gradient: 'from-dynamic-yellow to-dynamic-orange',
    icon: 'text-dynamic-yellow',
    iconBox: 'bg-dynamic-yellow/10',
  },
} satisfies Record<string, Tone>;

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-secondary font-semibold text-secondary-foreground transition-[color,box-shadow]',
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  );
}

export function SectionIntro({
  children,
  subtitle,
  title,
}: {
  children?: ReactNode;
  subtitle?: string;
  title: ReactNode;
}) {
  return (
    <div className="mb-16 text-center">
      <h2 className="mb-4 bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text pb-4 font-bold text-4xl text-transparent sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mx-auto max-w-3xl text-foreground/70 text-lg">
          {subtitle}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function ImageFrame({
  alt,
  className,
  imageClassName,
  priority = false,
  src,
}: {
  alt: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  src: string;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border-2 shadow-xl transition-all hover:shadow-2xl',
        className
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn(
          'h-full w-full object-cover transition-transform duration-500 group-hover:scale-105',
          imageClassName
        )}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
      />
    </div>
  );
}

export function LanguageSwitcher({
  className,
  languageAvailable,
  locale,
}: {
  className?: string;
  languageAvailable: string;
  locale: Locale;
}) {
  const targetLocale: Locale = locale === 'vi' ? 'en' : 'vi';
  const targetHref = `/${targetLocale}/women-in-tech`;
  const label = locale === 'vi' ? 'Read in English' : 'Đọc bằng tiếng Việt';

  const rememberLocale = () => {
    if (typeof document === 'undefined') {
      return;
    }

    // biome-ignore lint/suspicious/noDocumentCookie: Mirrors the legacy locale switcher without a client API call.
    document.cookie = `${localeCookieName}=${targetLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };

  return (
    <div className={cn('flex flex-col items-end gap-2', className)}>
      <div className="rounded-lg border border-border/50 bg-background/80 px-3 py-1.5 text-muted-foreground text-xs">
        {languageAvailable}
      </div>
      <Button
        asChild
        className="group gap-2 border-dynamic-pink/30 bg-background/80 font-semibold transition-all hover:border-dynamic-pink/50 hover:bg-dynamic-pink/10"
        size="sm"
        variant="outline"
      >
        <a href={targetHref} onClick={rememberLocale}>
          <Globe className="h-4 w-4 transition-transform group-hover:rotate-12" />
          {label}
        </a>
      </Button>
    </div>
  );
}
