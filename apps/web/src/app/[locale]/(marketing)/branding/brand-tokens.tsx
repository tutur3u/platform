'use client';

import { Check, Copy } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

/** Section heading plus the colour and system token cards. */

export function SectionHeader({
  description,
  eyebrow,
  inverted = false,
  title,
}: {
  description: string;
  eyebrow: string;
  inverted?: boolean;
  title: string;
}) {
  return (
    <div className="mb-12 grid gap-6 lg:grid-cols-[0.72fr_0.58fr] lg:items-end">
      <div>
        <p
          className={cn(
            'mb-4 font-medium text-sm',
            inverted ? 'text-dynamic-blue' : 'text-foreground/45'
          )}
        >
          {eyebrow}
        </p>
        <h2 className="text-pretty font-semibold text-4xl tracking-tight sm:text-6xl">
          {title}
        </h2>
      </div>
      <p className={cn('text-foreground/58 text-lg leading-8')}>
        {description}
      </p>
    </div>
  );
}

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
      className="overflow-hidden rounded-lg border border-border bg-root-background"
      initial={{ opacity: 0, y: 22 }}
      transition={{ delay: index * 0.04, duration: 0.4 }}
      viewport={{ once: true, margin: '-80px' }}
      whileHover={{ rotate: index % 2 === 0 ? -1 : 1, scale: 1.015 }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <motion.div
        animate={{ x: ['-8%', '0%', '-8%'] }}
        className="h-20 w-[116%] border-border border-b"
        style={{ backgroundColor: color }}
        transition={{
          duration: 5 + index * 0.25,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <div className="grid min-h-52 grid-rows-[1fr_auto] p-5">
        <div>
          <p className="mb-5 font-semibold text-foreground/35 text-sm tabular-nums">
            0{index}
          </p>
          <h3 className="font-semibold text-2xl">{title}</h3>
          <p className="mt-3 text-foreground/62 leading-7">{description}</p>
        </div>
        <button
          className="mt-8 inline-flex w-fit items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-mono text-foreground text-sm transition hover:bg-muted"
          onClick={onCopy}
          type="button"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {color}
        </button>
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
        'flex min-h-52 flex-col items-start justify-between rounded-lg border border-border p-5 text-left transition hover:scale-[1.01]',
        contentClassName
      )}
      initial={{ opacity: 0, y: 22 }}
      onClick={onCopy}
      transition={{ duration: 0.42 }}
      viewport={{ once: true, margin: '-80px' }}
      whileHover={{ scale: 1.015, y: -3 }}
      whileInView={{ opacity: 1, y: 0 }}
      style={{ backgroundColor: color }}
      type="button"
    >
      <span className="font-semibold text-xl">{title}</span>
      <span className="inline-flex items-center gap-2 font-mono text-sm">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {color}
      </span>
    </motion.button>
  );
}
