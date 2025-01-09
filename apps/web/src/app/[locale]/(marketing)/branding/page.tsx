'use client';

import LogoTab from './logo-tab';
import { Badge } from '@repo/ui/components/ui/badge';
import { motion } from 'framer-motion';

const BrandingPage = () => {
  const brandValues = [
    {
      title: 'Innovation',
      description: 'Pushing boundaries with cutting-edge technology',
      color: '#4180E9',
    },
    {
      title: 'Growth',
      description: 'Sustainable development and continuous improvement',
      color: '#4ACA3F',
    },
    {
      title: 'Energy',
      description: 'Dynamic and passionate approach to challenges',
      color: '#FB7B05',
    },
    {
      title: 'Impact',
      description: "Making a real difference in people's lives",
      color: '#E94646',
    },
  ];

  const typography = {
    primary: 'Inter',
    weights: ['400 Regular', '500 Medium', '600 Semibold', '700 Bold'],
    usage: 'Used across all digital platforms and marketing materials',
  };

  return (
    <main className="container relative space-y-24 py-24">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <Badge variant="secondary" className="mb-6">
          Brand Guidelines
        </Badge>
        <h1 className="text-foreground mb-6 text-balance text-5xl font-bold">
          Our Brand Identity
        </h1>
        <p className="text-foreground/80 mx-auto max-w-2xl text-lg">
          These guidelines ensure our brand remains consistent, recognizable,
          and impactful across all platforms and touchpoints.
        </p>
      </motion.section>

      {/* Logo Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="space-y-12"
      >
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold">Tuturuuu</h2>
          <p className="text-foreground/80">
            Our primary brand mark represents innovation, trust, and excellence.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <LogoTab
              logoImage="/media/logos/dark-rounded.png"
              pngLink="/media/logos/dark-rounded.png"
              alt="Dark logo"
            />
            <LogoTab
              logoImage="/media/logos/light-rounded.png"
              pngLink="/media/logos/light-rounded.png"
              alt="Light logo"
              light
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-3xl font-semibold">Mira AI</h2>
          <p className="text-foreground/80">
            Our AI platform brand embodies intelligence, reliability, and
            innovation.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <LogoTab
              logoImage="/media/logos/mira-dark.png"
              pngLink="/media/logos/mira-dark.png"
              alt="Dark logo"
            />
            <LogoTab
              logoImage="/media/logos/mira-light.png"
              pngLink="/media/logos/mira-light.png"
              alt="Light logo"
              light
            />
          </div>
        </div>
      </motion.section>

      {/* Color System */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="space-y-8"
      >
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold">Color System</h2>
          <p className="text-foreground/80">
            Our color palette reflects our brand values and ensures visual
            harmony across all platforms.
          </p>
        </div>

        <div className="grid gap-6">
          <div className="space-y-4">
            <h3 className="text-xl font-medium">Primary Colors</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {brandValues.map((value, index) => (
                <motion.div
                  key={index}
                  className="overflow-hidden rounded-lg border"
                  whileHover={{ y: -5 }}
                >
                  <div
                    className="flex h-32 items-center justify-center p-4 text-white"
                    style={{ backgroundColor: value.color }}
                  >
                    <span className="font-mono">{value.color}</span>
                  </div>
                  <div className="space-y-1 p-4">
                    <h4 className="font-medium">{value.title}</h4>
                    <p className="text-foreground/60 text-sm">
                      {value.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-medium">System Colors</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="overflow-hidden rounded-lg border">
                <div className="flex h-32 items-center justify-center bg-[#09090B] p-4 text-white">
                  <span className="font-mono">#09090B</span>
                </div>
                <div className="p-4">
                  <h4 className="font-medium">Background Dark</h4>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <div className="flex h-32 items-center justify-center bg-[#26292F] p-4 text-white">
                  <span className="font-mono">#26292F</span>
                </div>
                <div className="p-4">
                  <h4 className="font-medium">Surface Dark</h4>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <div className="flex h-32 items-center justify-center bg-[#FFFFFF] p-4 text-[#363636]">
                  <span className="font-mono">#FFFFFF</span>
                </div>
                <div className="p-4">
                  <h4 className="font-medium">Background Light</h4>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <div className="flex h-32 items-center justify-center bg-[#363636] p-4 text-white">
                  <span className="font-mono">#363636</span>
                </div>
                <div className="p-4">
                  <h4 className="font-medium">Surface Light</h4>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Typography */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="space-y-8"
      >
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold">Typography</h2>
          <p className="text-foreground/80">
            Our typeface selection ensures clarity and readability while
            maintaining brand consistency.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="space-y-6 p-8">
            <div>
              <h3 className="text-2xl font-medium">{typography.primary}</h3>
              <p className="text-foreground/60">{typography.usage}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {typography.weights.map((weight, index) => (
                <div
                  key={index}
                  className="bg-foreground/5 flex items-center justify-between rounded-lg p-4"
                >
                  <span
                    className="text-lg"
                    style={{ fontWeight: Number(weight.split(' ')[0]) }}
                  >
                    The quick brown fox jumps over the lazy dog
                  </span>
                  <span className="text-foreground/60 text-sm">{weight}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Usage Guidelines */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="space-y-8"
      >
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold">Usage Guidelines</h2>
          <p className="text-foreground/80">
            Follow these guidelines to maintain brand consistency across all
            applications.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border p-6">
            <h3 className="mb-4 text-xl font-medium">Logo Usage</h3>
            <ul className="text-foreground/80 list-inside list-disc space-y-2">
              <li>Maintain clear space around logos</li>
              <li>Never alter the logo colors</li>
              <li>Use appropriate logo versions for different backgrounds</li>
              <li>Maintain minimum size requirements</li>
            </ul>
          </div>

          <div className="rounded-lg border p-6">
            <h3 className="mb-4 text-xl font-medium">Color Application</h3>
            <ul className="text-foreground/80 list-inside list-disc space-y-2">
              <li>Use primary colors for key elements</li>
              <li>Maintain proper contrast ratios</li>
              <li>Follow accessibility guidelines</li>
              <li>Use system colors appropriately</li>
            </ul>
          </div>

          <div className="rounded-lg border p-6">
            <h3 className="mb-4 text-xl font-medium">Typography Rules</h3>
            <ul className="text-foreground/80 list-inside list-disc space-y-2">
              <li>Maintain hierarchy in text elements</li>
              <li>Use appropriate font weights</li>
              <li>Ensure readability at all sizes</li>
              <li>Follow spacing guidelines</li>
            </ul>
          </div>
        </div>
      </motion.section>
    </main>
  );
};

export default BrandingPage;
