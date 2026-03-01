'use client';

import { motion } from 'framer-motion';
import ColorCard from './color-card';

const colorPalettes = [
  {
    label: 'Light Palette',
    colors: ['#4896AC', '#202946', '#FBB61B', '#E3EDF9'],
  },
  {
    label: 'Dark Palette',
    colors: ['#8CE7FF', '#171624', '#FFE120', '#F2F7FC'],
  },
];

export default function ColorPaletteSection() {
  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
        className="space-y-6 text-center"
      >
        <h2 className="font-bold text-4xl tracking-tight md:text-5xl">
          Color Palette
        </h2>
        <p className="mx-auto max-w-2xl text-muted-foreground text-sm leading-relaxed md:text-base">
          Our carefully curated color palette reflects NCT Hub's identity—from
          vibrant primary tones to subtle accents. These colors are designed to
          work harmoniously across light and dark themes, ensuring consistency
          and accessibility throughout our brand experience.
        </p>
      </motion.div>

      {/* Color Palettes */}
      <div className="space-y-16 py-8">
        {colorPalettes.map((palette, paletteIndex) => (
          <motion.div
            key={palette.label}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: paletteIndex * 0.2 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <h3 className="font-semibold text-2xl">{palette.label}</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {palette.colors.map((color, colorIndex) => (
                <ColorCard
                  key={color}
                  hex={color}
                  delay={paletteIndex * 0.2 + colorIndex * 0.1}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
