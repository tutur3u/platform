'use client';

import { Button } from '@ncthub/ui/button';
import { Download } from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react';
import '@/style/checkerboard.css';

const logoVariants = [
  {
    id: 'logo-only',
    title: 'Logomark',
    subtitle: 'The standalone emblem',
    description:
      'The iconic tilted "N" emblem. Use when space is limited or when the brand is already established in context.',
    images: [
      {
        src: '/media/logos/transparent/dark-logo-only-transparent.png',
        alt: 'NCT Dark Logomark',
        theme: 'dark' as const,
      },
      {
        src: '/media/logos/transparent/light-logo-only-transparent.png',
        alt: 'NCT Light Logomark',
        theme: 'light' as const,
      },
    ],
  },
  {
    id: 'square-logo',
    title: 'Full Lockup',
    subtitle: 'The complete brand mark',
    description:
      'The full logo including the "N" emblem and wordmark. This is the primary logo for most applications.',
    images: [
      {
        src: '/media/logos/transparent/dark-logo-transparent.png',
        alt: 'NCT Dark Full Logo',
        theme: 'dark' as const,
      },
      {
        src: '/media/logos/transparent/light-logo-transparent.png',
        alt: 'NCT Light Full Logo',
        theme: 'light' as const,
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

function LogoCard({
  image,
  index,
}: {
  image: (typeof logoVariants)[0]['images'][0];
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
          {isDark ? 'On Dark' : 'On Light'}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/50 tracking-widest">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {/* Logo display area */}
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
        {/* Logo image */}
        <motion.div
          className="relative h-3/5 w-3/5"
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
            className="object-contain drop-shadow-lg"
          />
        </motion.div>

        {/* Download button on hover */}
        <motion.div
          className="absolute right-3 bottom-3"
          initial={false}
          animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 8 }}
          transition={{ duration: 0.3 }}
        >
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-lg backdrop-blur-md',
              isDark
                ? 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                : 'bg-black/5 text-black/50 hover:bg-black/10 hover:text-black'
            )}
            asChild
          >
            <a href={image.src} download>
              <Download className="h-3.5 w-3.5" />
            </a>
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function LogoSection() {
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
          Logo Design
        </h2>

        <p className="mx-auto max-w-2xl text-center text-muted-foreground leading-relaxed">
          The logo features a tilted 45&deg; letter &ldquo;N&rdquo;,
          representing Neo Culture Tech. The emblem uses dark blue, light blue,
          and mustard yellow&mdash;the signature colours of the club. The dark
          variant features a neon treatment with glowing blue and yellow
          outlines. Set in Gotham, a geometric sans-serif.
        </p>
      </motion.div>

      {/* Logo groups */}
      <div className="space-y-24">
        {logoVariants.map((variant, variantIndex) => (
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

            {/* Logo grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {variant.images.map((image, imgIndex) => (
                <LogoCard
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
