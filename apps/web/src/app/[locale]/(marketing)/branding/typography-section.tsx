'use client';

import { cn } from '@ncthub/utils/format';
import { motion } from 'framer-motion';
import { Montserrat, Poppins } from 'next/font/google';

const montserrat = Montserrat({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const stagger = {
  container: {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.12, delayChildren: 0.1 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const },
    },
  },
};

interface FontWeight {
  value: number;
  label: string;
}

interface FontSpecimen {
  name: string;
  description: string;
  fontClass: string;
  weights: FontWeight[];
}

const fontSpecimens: FontSpecimen[] = [
  {
    name: 'Montserrat',
    description: 'Gotham substitute for headings and display text',
    fontClass: montserrat.className,
    weights: [
      { value: 400, label: 'Regular' },
      { value: 500, label: 'Medium' },
      { value: 600, label: 'Semibold' },
      { value: 700, label: 'Bold' },
    ],
  },
  {
    name: 'Poppins',
    description: 'Primary font for slides and presentations',
    fontClass: poppins.className,
    weights: [
      { value: 400, label: 'Regular' },
      { value: 500, label: 'Medium' },
      { value: 600, label: 'Semibold' },
      { value: 700, label: 'Bold' },
    ],
  },
];

const PANGRAM = 'The quick brown fox jumps over the lazy dog';

function FontCard({
  specimen,
  index,
}: {
  specimen: FontSpecimen;
  index: number;
}) {
  return (
    <motion.div
      variants={stagger.container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
    >
      {/* Group header */}
      <motion.div
        variants={stagger.item}
        className="mb-8 flex items-end justify-between border-border/50 border-b pb-4"
      >
        <div>
          <p className="mb-1 font-mono text-brand-light-yellow text-xs uppercase tracking-[0.2em]">
            Typeface {String(index + 1).padStart(2, '0')}
          </p>
          <h3 className="font-semibold text-2xl tracking-tight md:text-3xl">
            {specimen.name}
          </h3>
        </div>
        <p className="hidden max-w-xs text-right text-muted-foreground text-sm leading-relaxed md:block">
          {specimen.description}
        </p>
      </motion.div>

      {/* Description on mobile */}
      <motion.p
        variants={stagger.item}
        className="mb-6 text-muted-foreground text-sm leading-relaxed md:hidden"
      >
        {specimen.description}
      </motion.p>

      {/* Specimen card */}
      <motion.div
        variants={stagger.item}
        className="overflow-hidden rounded-2xl border bg-linear-to-br from-pink-50/60 via-white to-blue-50/60 dark:from-pink-950/20 dark:via-background dark:to-blue-950/20"
      >
        <div className="p-6 md:p-8">
          {/* Font name in actual font */}
          <h4
            className={cn(
              'font-bold text-3xl tracking-tight md:text-4xl',
              specimen.fontClass
            )}
          >
            {specimen.name}
          </h4>
          <p className="mt-2 text-muted-foreground text-sm">
            {specimen.description}
          </p>
        </div>

        {/* Weight samples */}
        <div className="space-y-3 px-6 pb-6 md:px-8 md:pb-8">
          {specimen.weights.map((weight) => (
            <div
              key={weight.value}
              className="flex items-center justify-between rounded-xl bg-muted/50 px-5 py-4 md:px-6"
            >
              <p
                className={cn('text-base md:text-lg', specimen.fontClass)}
                style={{ fontWeight: weight.value }}
              >
                {PANGRAM}
              </p>
              <span className="ml-4 shrink-0 text-muted-foreground text-sm">
                {weight.value} {weight.label}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function TypographySection() {
  return (
    <section className="mx-auto max-w-6xl">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        viewport={{ once: true }}
        className="mb-16 space-y-6 text-center"
      >
        <h2 className="font-bold text-4xl tracking-tight md:text-5xl">
          Typography
        </h2>

        <p className="mx-auto max-w-2xl text-muted-foreground text-sm leading-relaxed md:text-base">
          Mostly use Sans Serif for design typography or infographic &mdash;
          Gotham, Poppins (slide), Times New Roman (social post).
        </p>
      </motion.div>

      {/* Font specimens */}
      <div className="space-y-24">
        {fontSpecimens.map((specimen, index) => (
          <FontCard key={specimen.name} specimen={specimen} index={index} />
        ))}
      </div>
    </section>
  );
}
