'use client';

import { cn } from '@ncthub/utils/format';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react';
import '@/style/checkerboard.css';

const lanyardVariants = [
  {
    id: 'dark-lanyard',
    title: 'Dark Lanyard',
    subtitle: 'The official club lanyard',
    description:
      'Our official lanyard featuring the NCT branding. Designed for events, meetings, and everyday use to proudly represent the club.',
    images: [
      {
        src: '/landyard/dark-landyard.png',
        alt: 'Dark Lanyard',
        label: 'Dark Variant',
        theme: 'dark' as const,
      },
    ],
  },
];

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
      transition: {
        duration: 0.7,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
      },
    },
  },
};

function LanyardCard({
  image,
  index,
}: {
  image: (typeof lanyardVariants)[0]['images'][0];
  index: number;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isDark = image.theme === 'dark';

  return (
    <motion.div
      variants={stagger.item}
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Specimen label */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
          {image.label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/50 tracking-widest">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {/* Image display area */}
      <motion.div
        className={cn(
          'relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-2xl border transition-colors duration-500',
          isDark
            ? 'checkerboard-dark border-white/6'
            : 'checkerboard-light border-black/6'
        )}
        animate={{
          borderColor: isHovered
            ? isDark
              ? 'rgba(140, 231, 255, 0.25)'
              : 'rgba(72, 150, 172, 0.3)'
            : isDark
              ? 'rgba(255, 255, 255, 0.06)'
              : 'rgba(0, 0, 0, 0.06)',
        }}
        transition={{ duration: 0.4 }}
      >
        {/* Lanyard image */}
        <motion.div
          className="relative h-full w-full"
          animate={{ scale: isHovered ? 1.04 : 1 }}
          transition={{
            duration: 0.6,
            ease: [0.25, 0.46, 0.45, 0.94] as const,
          }}
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className="object-contain drop-shadow-2xl"
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function LanyardSection() {
  return (
    <section className="mx-auto max-w-2xl">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.8,
          ease: [0.25, 0.46, 0.45, 0.94] as const,
        }}
        viewport={{ once: true }}
        className="mb-16 space-y-6 text-center"
      >
        <h2 className="font-bold text-4xl tracking-tight md:text-5xl">
          Lanyard Design
        </h2>

        <p className="mx-auto max-w-2xl text-center text-muted-foreground leading-relaxed">
          Our official club lanyard, designed for events, conferences, and
          everyday use. The lanyard proudly features the Neo Culture Tech
          identity and serves as a recognizable accessory for all members.
        </p>
      </motion.div>

      {/* Lanyard groups */}
      <div className="space-y-24">
        {lanyardVariants.map((variant, variantIndex) => (
          <motion.div
            key={variant.id}
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
                  Variant {String(variantIndex + 1).padStart(2, '0')}
                </p>
                <h3 className="font-semibold text-2xl tracking-tight md:text-3xl">
                  {variant.title}
                </h3>
              </div>
              <p className="hidden max-w-xs text-right text-muted-foreground text-sm leading-relaxed md:block">
                {variant.description}
              </p>
            </motion.div>

            {/* Subtitle on mobile */}
            <motion.p
              variants={stagger.item}
              className="mb-6 text-muted-foreground text-sm leading-relaxed md:hidden"
            >
              {variant.description}
            </motion.p>

            {/* Image grid */}
            <div
              className={cn(
                'grid gap-6',
                variant.images.length === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-1 md:grid-cols-2'
              )}
            >
              {variant.images.map((image, imgIndex) => (
                <LanyardCard
                  key={image.src}
                  image={image}
                  index={variantIndex * 2 + imgIndex}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
