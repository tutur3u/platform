import { ArrowRight } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import type { ShowcaseCategory } from './component-registry';
import { CopyButton } from './copy-button';
import { highlightCode } from './shiki';
import { getAccent } from './ui-docs-theme';

type IconType = ComponentType<{ className?: string }>;

export function DocsPageHeader({
  badge,
  title,
  description,
  children,
  accent,
  pattern,
}: {
  badge?: string;
  title: string;
  description: string;
  children?: ReactNode;
  /** Category accent; omit for the neutral brand accent. */
  accent?: ShowcaseCategory;
  /** Render the premium gradient/grid backdrop (use on landing-style headers). */
  pattern?: boolean;
}) {
  const a = getAccent(accent);

  return (
    <header className="relative grid gap-5 pb-8">
      {pattern ? (
        <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_6%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_6%,transparent)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
          <div
            className={cn(
              'absolute -top-24 left-1/4 size-72 rounded-full bg-gradient-to-br opacity-20 blur-3xl',
              a.gradient
            )}
          />
        </div>
      ) : null}
      {badge ? (
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-full border px-3 py-1 font-mono-ui text-[0.62rem] uppercase tracking-[0.2em]',
            a.bg,
            a.text,
            a.border
          )}
        >
          {badge}
        </span>
      ) : null}
      <div className="grid max-w-3xl gap-3">
        <h1 className="text-balance font-display font-semibold text-4xl leading-[1.05] tracking-[-0.03em] md:text-5xl">
          {title}
        </h1>
        <p className="text-foreground/55 text-lg leading-relaxed">
          {description}
        </p>
      </div>
      {children}
    </header>
  );
}

export function DocsSection({
  id,
  title,
  description,
  children,
  accent,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  accent?: ShowcaseCategory;
}) {
  const a = getAccent(accent);

  return (
    <section className="scroll-mt-24 py-8" id={id}>
      <div className="grid gap-3">
        <div className="flex items-center gap-2.5">
          <span className={cn('size-1.5 rounded-full', a.dot)} />
          <span
            aria-hidden
            className="h-px w-6 bg-gradient-to-r from-foreground/25 to-transparent"
          />
          <h2 className="font-display font-semibold text-2xl tracking-[-0.02em]">
            {title}
          </h2>
        </div>
        {description ? (
          <p className="max-w-3xl text-foreground/50 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export async function CodeBlock({
  code,
  label,
  className,
  language,
}: {
  code: string;
  label?: string;
  className?: string;
  /** Shiki language. Defaults to `tsx` (or `bash` for the terminal label). */
  language?: string;
}) {
  const lang = language ?? (label === 'terminal' ? 'bash' : 'tsx');
  const highlighted = await highlightCode(code, lang);

  return (
    <div
      className={cn(
        'ui-docs-code group/code relative overflow-hidden rounded-xl border bg-card shadow-sm',
        className
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-dynamic-red/60" />
          <span className="size-2.5 rounded-full bg-dynamic-yellow/60" />
          <span className="size-2.5 rounded-full bg-dynamic-green/60" />
        </span>
        {label ? (
          <span className="ml-1 font-medium font-mono text-muted-foreground text-xs">
            {label}
          </span>
        ) : null}
      </div>
      <div
        className="[&_pre]:!bg-transparent overflow-x-auto p-4 pr-14 text-sm leading-6"
        // Shiki output is generated server-side from trusted, static code
        // strings in the component registry, so it is safe to inject.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted shiki output
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      <CopyButton code={code} />
    </div>
  );
}

export function LinkGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>{children}</div>
  );
}

export function LinkPanel({
  href,
  title,
  description,
  meta,
  accent,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  meta?: string;
  accent?: ShowcaseCategory;
  icon?: IconType;
}) {
  const a = getAccent(accent);

  return (
    <Link
      className={cn(
        'group relative grid gap-3 overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/15 hover:bg-foreground/[0.03] hover:shadow-2xl hover:shadow-foreground/5 focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-4',
        a.ring
      )}
      href={href}
    >
      {/* Lit top edge, matching the marketing card language */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r opacity-40 transition-opacity duration-500 group-hover:opacity-100',
          a.gradient
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span
              className={cn(
                'grid size-8 place-items-center rounded-lg border',
                a.bg,
                a.text,
                a.border
              )}
            >
              <Icon className="size-4" />
            </span>
          ) : null}
          <h3 className="font-semibold">{title}</h3>
        </div>
        <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <p className="text-foreground/50 text-sm leading-relaxed">
        {description}
      </p>
      {meta ? (
        <div className="font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.14em]">
          {meta}
        </div>
      ) : null}
    </Link>
  );
}
