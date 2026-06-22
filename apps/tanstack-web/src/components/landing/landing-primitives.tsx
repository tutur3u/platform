import type { ComponentProps, ReactNode } from 'react';

export const joinClassNames = (...classNames: (string | undefined)[]) =>
  classNames.filter(Boolean).join(' ');

export function SectionShell({
  children,
  className,
  id,
}: Readonly<{
  children: ReactNode;
  className?: string;
  id?: string;
}>) {
  return (
    <section
      className={joinClassNames(
        'relative scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24',
        className
      )}
      id={id}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  highlight,
  subtitle,
  title,
}: Readonly<{
  eyebrow?: string;
  highlight?: string;
  subtitle: string;
  title: string;
}>) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-14">
      {eyebrow ? (
        <p className="mb-3 font-medium text-dynamic-purple text-sm">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-bold text-3xl tracking-normal sm:text-4xl">
        {title}{' '}
        {highlight ? (
          <span className="bg-gradient-to-r from-dynamic-purple via-dynamic-blue to-dynamic-cyan bg-clip-text text-transparent">
            {highlight}
          </span>
        ) : null}
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-foreground/60 text-lg">
        {subtitle}
      </p>
    </div>
  );
}

export function SurfaceCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={joinClassNames(
        'rounded-lg border border-foreground/10 bg-background/85 p-5 shadow-sm backdrop-blur',
        className
      )}
      {...props}
    />
  );
}

export function ActionLink({
  className,
  variant = 'primary',
  ...props
}: ComponentProps<'a'> & {
  variant?: 'primary' | 'secondary';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-gradient-to-r from-dynamic-purple to-dynamic-blue text-white shadow-lg shadow-dynamic-purple/20 hover:shadow-dynamic-purple/30'
      : 'border border-foreground/15 bg-background text-foreground hover:bg-foreground/5';

  return (
    <a
      className={joinClassNames(
        'inline-flex h-11 items-center justify-center gap-2 rounded-md px-6 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        styles,
        className
      )}
      {...props}
    />
  );
}
