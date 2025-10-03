'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Check, Copy } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { motion } from 'framer-motion';
import { Inter, Noto_Sans } from 'next/font/google';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import LogoTab from './logo-tab';

const inter = Inter({ subsets: ['latin'] });
const notoSans = Noto_Sans({ subsets: ['latin'] });

const BrandingPage = () => {
  const t = useTranslations();
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const copyColor = (color: string) => {
    navigator.clipboard.writeText(color);
    setCopiedColor(color);
    toast.success(t('branding.colorCopied', { color }));
    setTimeout(() => setCopiedColor(null), 2000);
  };

  const brandValues = [
    {
      title: t('branding.colors.primary.innovation.title'),
      description: t('branding.colors.primary.innovation.description'),
      color: '#4180E9',
    },
    {
      title: t('branding.colors.primary.growth.title'),
      description: t('branding.colors.primary.growth.description'),
      color: '#4ACA3F',
    },
    {
      title: t('branding.colors.primary.energy.title'),
      description: t('branding.colors.primary.energy.description'),
      color: '#FB7B05',
    },
    {
      title: t('branding.colors.primary.impact.title'),
      description: t('branding.colors.primary.impact.description'),
      color: '#E94646',
    },
  ];

  const typography = {
    fonts: [
      {
        name: 'Inter',
        className: inter.className,
        usage: t('branding.typography.inter.usage'),
        weights: ['400 Regular', '500 Medium', '600 Semibold', '700 Bold'],
      },
      {
        name: 'Noto Sans',
        className: notoSans.className,
        usage: t('branding.typography.notoSans.usage'),
        weights: ['400 Regular', '500 Medium', '600 Semibold', '700 Bold'],
      },
    ],
  };

  return (
    <main className="relative space-y-16 px-4 py-24 sm:space-y-20 sm:px-6 sm:py-32 lg:space-y-24 lg:px-8 lg:py-40">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-5xl text-center"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          <Badge
            variant="secondary"
            className="mb-6 px-4 py-1.5 text-sm shadow-sm"
          >
            {t('branding.hero.badge')}
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          {t('branding.hero.title')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mx-auto max-w-2xl text-balance text-foreground/70 text-lg sm:text-xl"
        >
          {t('branding.hero.description')}
        </motion.p>
      </motion.section>

      {/* Logo Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-6xl space-y-12 sm:space-y-16"
      >
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="font-semibold text-3xl sm:text-4xl">Tuturuuu</h2>
            <p className="mt-3 text-foreground/70 text-lg sm:text-xl">
              {t('branding.logos.tuturuuu.description')}
            </p>
          </motion.div>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
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

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="font-semibold text-3xl sm:text-4xl">Mira AI</h2>
            <p className="mt-3 text-foreground/70 text-lg sm:text-xl">
              {t('branding.logos.mira.description')}
            </p>
          </motion.div>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
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
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-6xl space-y-8 sm:space-y-12"
      >
        <div className="space-y-4">
          <h2 className="font-semibold text-3xl sm:text-4xl">
            {t('branding.colors.title')}
          </h2>
          <p className="text-foreground/70 text-lg sm:text-xl">
            {t('branding.colors.description')}
          </p>
        </div>

        <div className="space-y-8 sm:space-y-12">
          <div className="space-y-6">
            <h3 className="font-medium text-2xl sm:text-3xl">
              {t('branding.colors.primaryTitle')}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              {brandValues.map((value, index) => (
                <motion.div
                  key={index}
                  className="group overflow-hidden rounded-xl border border-border/50 shadow-sm transition-all duration-300 hover:shadow-lg"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3 }}
                  whileHover={{
                    y: -8,
                    scale: 1.02,
                    transition: { duration: 0.2 },
                  }}
                >
                  <div
                    className="relative flex h-28 items-center justify-center p-4 text-white transition-all duration-300 group-hover:h-32 sm:h-32"
                    style={{ backgroundColor: value.color }}
                  >
                    <span className="font-mono text-sm sm:text-base">
                      {value.color}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 bg-white/20 text-white backdrop-blur-sm transition-all hover:bg-white/30"
                      onClick={() => copyColor(value.color)}
                    >
                      {copiedColor === value.color ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="space-y-2 p-4 sm:p-5">
                    <h4 className="font-semibold text-base sm:text-lg">
                      {value.title}
                    </h4>
                    <p className="text-foreground/60 text-sm leading-relaxed">
                      {value.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="font-medium text-2xl sm:text-3xl">
              {t('branding.colors.systemTitle')}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              {[
                {
                  color: '#09090B',
                  label: 'backgroundDark',
                  textColor: 'text-white',
                },
                {
                  color: '#26292F',
                  label: 'surfaceDark',
                  textColor: 'text-white',
                },
                {
                  color: '#FFFFFF',
                  label: 'backgroundLight',
                  textColor: 'text-[#363636]',
                },
                {
                  color: '#363636',
                  label: 'surfaceLight',
                  textColor: 'text-white',
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  className="overflow-hidden rounded-xl border border-border/50 shadow-sm transition-all duration-300 hover:shadow-lg"
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                >
                  <div
                    className={`relative flex h-28 items-center justify-center p-4 sm:h-32 ${item.textColor}`}
                    style={{ backgroundColor: item.color }}
                  >
                    <span className="font-mono text-sm sm:text-base">
                      {item.color}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`absolute top-2 right-2 h-8 w-8 backdrop-blur-sm transition-all ${
                        item.color === '#FFFFFF'
                          ? 'bg-black/10 text-[#363636] hover:bg-black/20'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                      onClick={() => copyColor(item.color)}
                    >
                      {copiedColor === item.color ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="p-4 sm:p-5">
                    <h4 className="font-semibold text-base sm:text-lg">
                      {t(`branding.colors.system.${item.label}` as any)}
                    </h4>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Typography */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-6xl space-y-8"
      >
        <div className="space-y-4">
          <h2 className="font-semibold text-3xl sm:text-4xl">
            {t('branding.typography.title')}
          </h2>
          <p className="text-foreground/70 text-lg sm:text-xl">
            {t('branding.typography.description')}
          </p>
        </div>

        <div className="grid gap-6 lg:gap-8">
          {typography.fonts.map((font, fontIndex) => (
            <motion.div
              key={fontIndex}
              className="overflow-hidden rounded-xl border border-border/50 shadow-sm"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3 }}
            >
              <div className="space-y-8 p-6 sm:p-8 lg:p-10">
                <div className="space-y-2">
                  <h3
                    className={`font-semibold text-2xl sm:text-3xl ${font.className}`}
                  >
                    {font.name}
                  </h3>
                  <p className="text-foreground/60 text-base sm:text-lg">
                    {font.usage}
                  </p>
                </div>

                <div className="grid gap-4 sm:gap-6">
                  {font.weights.map((weight, index) => (
                    <motion.div
                      key={index}
                      className="group flex flex-col gap-3 rounded-xl bg-foreground/5 p-4 transition-all duration-300 hover:bg-foreground/10 sm:flex-row sm:items-center sm:justify-between sm:p-6"
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3 }}
                      whileHover={{ x: 5, transition: { duration: 0.2 } }}
                    >
                      <span
                        className={`text-base sm:text-lg lg:text-xl ${font.className}`}
                        style={{
                          fontWeight: Number(weight.split(' ')[0]),
                        }}
                      >
                        The quick brown fox jumps over the lazy dog
                      </span>
                      <span className="font-medium text-foreground/60 text-sm sm:text-base">
                        {weight}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Usage Guidelines */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-6xl space-y-8"
      >
        <div className="space-y-4">
          <h2 className="font-semibold text-3xl sm:text-4xl">
            {t('branding.guidelines.title')}
          </h2>
          <p className="text-foreground/70 text-lg sm:text-xl">
            {t('branding.guidelines.description')}
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
          <motion.div
            className="group rounded-xl border border-border/50 p-6 shadow-sm transition-all duration-300 hover:border-border hover:shadow-lg sm:p-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <h3 className="mb-4 font-semibold text-xl sm:mb-6 sm:text-2xl">
              {t('branding.guidelines.logo.title')}
            </h3>
            <ul className="space-y-3 text-foreground/70 sm:space-y-4">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.logo.rule1')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.logo.rule2')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.logo.rule3')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.logo.rule4')}
                </span>
              </li>
            </ul>
          </motion.div>

          <motion.div
            className="group rounded-xl border border-border/50 p-6 shadow-sm transition-all duration-300 hover:border-border hover:shadow-lg sm:p-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <h3 className="mb-4 font-semibold text-xl sm:mb-6 sm:text-2xl">
              {t('branding.guidelines.color.title')}
            </h3>
            <ul className="space-y-3 text-foreground/70 sm:space-y-4">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.color.rule1')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.color.rule2')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.color.rule3')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.color.rule4')}
                </span>
              </li>
            </ul>
          </motion.div>

          <motion.div
            className="group rounded-xl border border-border/50 p-6 shadow-sm transition-all duration-300 hover:border-border hover:shadow-lg sm:p-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <h3 className="mb-4 font-semibold text-xl sm:mb-6 sm:text-2xl">
              {t('branding.guidelines.typography.title')}
            </h3>
            <ul className="space-y-3 text-foreground/70 sm:space-y-4">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.typography.rule1')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.typography.rule2')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.typography.rule3')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span className="text-sm sm:text-base">
                  {t('branding.guidelines.typography.rule4')}
                </span>
              </li>
            </ul>
          </motion.div>
        </div>
      </motion.section>
    </main>
  );
};

export default BrandingPage;
