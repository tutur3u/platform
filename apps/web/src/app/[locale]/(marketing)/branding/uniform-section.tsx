'use client';

import { cn } from '@ncthub/utils/format';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react';
import '@/style/checkerboard.css';

const uniformVariants = [
  {
    id: 'polo-uniform',
    title: 'Polo Uniform',
    subtitle: 'The primary club uniform',
    description:
      'Our official polo shirt featuring the embroidered NCT logo. Designed for a smart and professional look at events and activities.',
    images: [
      {
        src: '/uniform/polo1.png',
        alt: 'Polo Uniform Front',
        label: 'Front View',
        theme: 'light' as const,
      },
      {
        src: '/uniform/polo2.png',
        alt: 'Polo Uniform Back',
        label: 'Back View',
        theme: 'light' as const,
      },
    ],
  },
  {
    id: 'sport-uniform',
    title: 'Sport Uniform',
    subtitle: 'The activewear variant',
    description:
      'A lightweight and breathable t-shirt designed for active and casual club engagements.',
    images: [
      {
        src: '/uniform/sport1.png',
        alt: 'Sport Uniform Front',
        label: 'Front View',
        theme: 'dark' as const,
      },
      {
        src: '/uniform/sport2.png',
        alt: 'Sport Uniform Back',
        label: 'Back View',
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
      transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as const },
    },
  },
};

function UniformCard({
  image,
  index,
}: {
  image: (typeof uniformVariants)[0]['images'][0];
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
            ? 'checkerboard-dark border-border/10'
            : 'checkerboard-light border-border/10'
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
        {/* Uniform image */}
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

export default function UniformSection() {
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
          Uniform Design
        </h2>

        <p className="mx-auto max-w-2xl text-center text-muted-foreground leading-relaxed">
          Our official club apparel. We offer two variations: a smart polo for
          formal events and meetings, and a lightweight sport t-shirt for active
          engagements. Both uniform styles proudly feature the Neo Culture Tech
          identity.
        </p>
      </motion.div>

      {/* Uniform groups */}
      <div className="space-y-24">
        {uniformVariants.map((variant, variantIndex) => (
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
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {variant.images.map((image, imgIndex) => (
                <UniformCard
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
