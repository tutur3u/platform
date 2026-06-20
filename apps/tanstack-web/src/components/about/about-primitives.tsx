import type { ComponentProps, ReactNode } from 'react';

export type AboutColor =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'yellow';

type AboutColorClasses = {
  badge: string;
  card: string;
  dot: string;
  iconBox: string;
  node: string;
  text: string;
};

const joinClassNames = (...classNames: (string | false | undefined)[]) =>
  classNames.filter(Boolean).join(' ');

export const aboutColorClasses: Record<AboutColor, AboutColorClasses> = {
  blue: {
    badge: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
    card: 'border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background hover:border-dynamic-blue/50 hover:shadow-dynamic-blue/10',
    dot: 'bg-dynamic-blue',
    iconBox: 'bg-dynamic-blue/10',
    node: 'bg-dynamic-blue/20',
    text: 'text-dynamic-blue',
  },
  cyan: {
    badge: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan',
    card: 'border-dynamic-cyan/30 bg-linear-to-br from-dynamic-cyan/5 via-background to-background hover:border-dynamic-cyan/50 hover:shadow-dynamic-cyan/10',
    dot: 'bg-dynamic-cyan',
    iconBox: 'bg-dynamic-cyan/10',
    node: 'bg-dynamic-cyan/20',
    text: 'text-dynamic-cyan',
  },
  green: {
    badge: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
    card: 'border-dynamic-green/30 bg-linear-to-br from-dynamic-green/5 via-background to-background hover:border-dynamic-green/50 hover:shadow-dynamic-green/10',
    dot: 'bg-dynamic-green',
    iconBox: 'bg-dynamic-green/10',
    node: 'bg-dynamic-green/20',
    text: 'text-dynamic-green',
  },
  orange: {
    badge: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
    card: 'border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/5 via-background to-background hover:border-dynamic-orange/50 hover:shadow-dynamic-orange/10',
    dot: 'bg-dynamic-orange',
    iconBox: 'bg-dynamic-orange/10',
    node: 'bg-dynamic-orange/20',
    text: 'text-dynamic-orange',
  },
  pink: {
    badge: 'border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink',
    card: 'border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-background to-background hover:border-dynamic-pink/50 hover:shadow-dynamic-pink/10',
    dot: 'bg-dynamic-pink',
    iconBox: 'bg-dynamic-pink/10',
    node: 'bg-dynamic-pink/20',
    text: 'text-dynamic-pink',
  },
  purple: {
    badge: 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
    card: 'border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background hover:border-dynamic-purple/50 hover:shadow-dynamic-purple/10',
    dot: 'bg-dynamic-purple',
    iconBox: 'bg-dynamic-purple/10',
    node: 'bg-dynamic-purple/20',
    text: 'text-dynamic-purple',
  },
  red: {
    badge: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
    card: 'border-dynamic-red/30 bg-linear-to-br from-dynamic-red/5 via-background to-background hover:border-dynamic-red/50 hover:shadow-dynamic-red/10',
    dot: 'bg-dynamic-red',
    iconBox: 'bg-dynamic-red/10',
    node: 'bg-dynamic-red/20',
    text: 'text-dynamic-red',
  },
  yellow: {
    badge: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
    card: 'border-dynamic-yellow/30 bg-linear-to-br from-dynamic-yellow/5 via-background to-background hover:border-dynamic-yellow/50 hover:shadow-dynamic-yellow/10',
    dot: 'bg-dynamic-yellow',
    iconBox: 'bg-dynamic-yellow/10',
    node: 'bg-dynamic-yellow/20',
    text: 'text-dynamic-yellow',
  },
};

const gradientClasses = {
  community:
    'bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue',
  core: 'bg-linear-to-r from-dynamic-orange via-dynamic-red to-dynamic-pink',
  ecosystem:
    'bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple',
  features:
    'bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue',
  hero: 'bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange',
  problem:
    'bg-linear-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow',
  tech: 'bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue',
  timeline:
    'bg-linear-to-r from-dynamic-yellow via-dynamic-orange to-dynamic-red',
  vision: 'bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green',
};

export type AboutGradient = keyof typeof gradientClasses;

export function AboutBackground() {
  return (
    <>
      <style>{`
        @keyframes about-orb-1 {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.2); opacity: 0.25; }
        }
        @keyframes about-orb-2 {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.15); opacity: 0.3; }
        }
        @keyframes about-orb-3 {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.15; }
          50% { transform: translateX(-50%) scale(1.3); opacity: 0.25; }
        }
        @keyframes about-grid-conic {
          0%, 100% { opacity: 0.05; }
          50% { opacity: 0.1; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/30 via-dynamic-pink/20 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
          style={{ animation: 'about-orb-1 8s ease-in-out infinite' }}
        />
        <div
          className="absolute top-[30%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/30 via-dynamic-cyan/20 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
          style={{ animation: 'about-orb-2 10s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-32 left-1/2 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-green/20 via-dynamic-emerald/15 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
          style={{ animation: 'about-orb-3 12s ease-in-out infinite' }}
        />
      </div>
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-size-[24px_24px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-size-[120px] opacity-50" />
        <div
          className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.08),transparent)]"
          style={{ animation: 'about-grid-conic 5s linear infinite' }}
        />
      </div>
    </>
  );
}

export function AboutBadge({
  className,
  color = 'purple',
  ...props
}: ComponentProps<'span'> & { color?: AboutColor }) {
  return (
    <span
      className={joinClassNames(
        'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 py-0.5 font-semibold text-xs transition-transform hover:scale-105',
        aboutColorClasses[color].badge,
        className
      )}
      {...props}
    />
  );
}

export function AboutButtonLink({
  className,
  size = 'lg',
  variant = 'solid',
  ...props
}: ComponentProps<'a'> & {
  size?: 'lg' | 'sm';
  variant?: 'outline' | 'solid';
}) {
  return (
    <a
      className={joinClassNames(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium shadow-sm transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        size === 'lg' ? 'h-11 px-8 text-sm' : 'h-9 px-3 text-sm',
        variant === 'solid'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        className
      )}
      {...props}
    />
  );
}

export function AboutCard({
  className,
  color,
  ...props
}: ComponentProps<'div'> & { color?: AboutColor }) {
  return (
    <div
      className={joinClassNames(
        'rounded-xl border bg-card text-card-foreground shadow-sm transition-all',
        color && aboutColorClasses[color].card,
        className
      )}
      {...props}
    />
  );
}

export function AboutHighlight({
  children,
  gradient,
}: {
  children: ReactNode;
  gradient: AboutGradient;
}) {
  return (
    <span
      className={joinClassNames(
        gradientClasses[gradient],
        'bg-clip-text text-transparent'
      )}
    >
      {children}
    </span>
  );
}

export function AboutSectionHeading({
  badge,
  gradient,
  highlight,
  part1,
  subtitle,
}: {
  badge?: ReactNode;
  gradient: AboutGradient;
  highlight: string;
  part1: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-16 text-center">
      {badge}
      <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
        {part1} <AboutHighlight gradient={gradient}>{highlight}</AboutHighlight>
      </h2>
      {subtitle ? (
        <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export { joinClassNames };
