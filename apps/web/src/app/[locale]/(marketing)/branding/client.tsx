'use client';

import { Badge } from '@ncthub/ui/badge';
import { Sparkles } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import ColorPaletteSection from './color-palette-section';
import LanyardSection from './lanyard-section';
import LogoSection from './logo-section';
import TypographySection from './typography-section';
import UniformSection from './uniform-section';

export default function BrandingContent() {
  return (
    <div className="container mx-auto space-y-48 px-4 py-16">
      {/* Hero Section */}
      <section className="space-y-8 text-center">
        {/* Hero Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2"
        >
          <Sparkles className="h-5 w-5 text-brand-light-yellow" />
          <Badge
            variant="outline"
            className="border-brand-light-blue/50 px-3 py-1 text-brand-light-blue text-sm"
          >
            Branding
          </Badge>
          <Sparkles className="h-5 w-5 text-brand-light-yellow" />
        </motion.div>

        {/* Main Title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="font-extrabold text-4xl leading-tight md:text-5xl lg:text-6xl"
        >
          Our Branding{' '}
          <span className="border-brand-light-yellow border-b-4 text-brand-light-blue">
            Guidelines
          </span>
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-lg text-muted-foreground md:text-xl"
        >
          The guidelines demonstrate the{' '}
          <span className="font-bold text-brand-light-blue">key elements</span>{' '}
          of the brand along with simple instructions for how to use them.
          Adherence to these guidelines is important to{' '}
          <span className="font-bold text-brand-light-blue">
            ensure consistency
          </span>{' '}
          and recognition of the brand.​
        </motion.p>
      </section>

      <LogoSection />

      <ColorPaletteSection />

      <TypographySection />

      <UniformSection />

      <LanyardSection />
    </div>
  );
}
