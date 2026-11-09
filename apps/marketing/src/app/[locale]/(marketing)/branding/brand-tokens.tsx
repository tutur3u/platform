'use client';

import { Check, Copy } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

/** Section heading plus the colour and system token cards. */

export function SectionHeader({
  description,
  eyebrow,
  index,
  title,
}: {
  description: string;
  eyebrow: string;
  /** Two-digit marker rendered in the rule, matching the marketing sections. */
  index?: string;
  title: string;
}) {
  return (
    <div className="mb-12 grid gap-6 lg:grid-cols-[0.72fr_0.58fr] lg:items-end">
      <div>
        {/* Same eyebrow language as every marketing section: mono, tracked,
            with an index and a hairline running off it. */}
        <div className="flex items-center gap-3 font-mono-ui text-[0.7rem] text-foreground/45 uppercase tracking-[0.22em]">
          {index ? (
            <>
              <span className="text-foreground/30 tabular-nums">{index}</span>
              <span
                aria-hidden
                className="h-px w-8 bg-gradient-to-r from-foreground/25 to-transparent"
              />
            </>
          ) : null}
          <span>{eyebrow}</span>
        </div>

        <h2 className="mt-6 text-balance font-display font-semibold text-4xl tracking-[-0.03em] sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
          {title}
        </h2>
      </div>
      <p className="text-balance text-foreground/55 text-lg leading-relaxed">
        {description}
      </p>
    </div>
  );
}

/**
 * A brand colour.
 *
 * The swatch used to be a `116%`-wide band sliding back and forth forever,
 * which read as a loading state rather than a colour chip. It now sits still
 * and carries its own reading — a colour reference is something you look at
 * and copy, not something that moves.
 */
export function ColorTokenCard({
  copied,
  color,
  description,
  index,
  onCopy,
  title,
}: {
  copied: boolean;
  color: string;
  description: string;
  index: number;
  onCopy: () => void;
  title: string;
}) {
  return (
    <motion.div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] transition-all duration-500 hover:-translate-y-1 hover:border-foreground/[0.18] hover:shadow-2xl hover:shadow-foreground/5"
      initial={{ opacity: 0, y: 22 }}
      transition={{ delay: index * 0.04, duration: 0.4 }}
      viewport={{ once: true, margin: '-80px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <div className="relative h-28 w-full" style={{ backgroundColor: color }}>
        {/* Sheen: gives a flat fill a light source so it reads as a surface. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.22),transparent_46%)]"
        />
        <span className="absolute top-3 left-4 font-mono-ui text-[0.6rem] text-white/70 uppercase tabular-nums tracking-[0.18em] mix-blend-overlay">
          {String(index).padStart(2, '0')}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display font-semibold text-xl tracking-[-0.02em]">
          {title}
        </h3>
        <p className="mt-2.5 text-foreground/55 text-sm leading-relaxed">
          {description}
        </p>

        <CopyChip
          className="mt-6"
          copied={copied}
          onCopy={onCopy}
          value={color}
        />
      </div>
    </motion.div>
  );
}

export function SystemTokenCard({
  contentClassName,
  copied,
  color,
  onCopy,
  title,
}: {
  contentClassName: string;
  copied: boolean;
  color: string;
  onCopy: () => void;
  title: string;
}) {
  return (
    <motion.button
      className={cn(
        'group flex min-h-44 flex-col items-start justify-between overflow-hidden rounded-2xl border border-foreground/[0.12] p-5 text-left transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-foreground/5',
        contentClassName
      )}
      initial={{ opacity: 0, y: 22 }}
      onClick={onCopy}
      style={{ backgroundColor: color }}
      transition={{ duration: 0.42 }}
      type="button"
      viewport={{ once: true, margin: '-80px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <span className="font-display font-semibold text-lg tracking-[-0.02em]">
        {title}
      </span>
      <span className="inline-flex items-center gap-2 font-mono-ui text-xs tabular-nums opacity-70 transition-opacity duration-300 group-hover:opacity-100">
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {color}
      </span>
    </motion.button>
  );
}

/** Shared copy affordance: mono value, state-swapping icon. */
export function CopyChip({
  className,
  copied,
  onCopy,
  value,
}: {
  className?: string;
  copied: boolean;
  onCopy: () => void;
  value: string;
}) {
  return (
    <button
      className={cn(
        'inline-flex w-fit items-center gap-2 rounded-full border border-foreground/[0.09] bg-foreground/[0.03] px-3 py-1.5 font-mono-ui text-[0.68rem] text-foreground/60 tabular-nums transition-colors hover:border-foreground/25 hover:text-foreground',
        className
      )}
      onClick={onCopy}
      type="button"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-dynamic-green" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {value}
    </button>
  );
}
