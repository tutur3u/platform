'use client';

import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FileText,
  Palette,
  Sparkles,
  Type,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { Inter, Noto_Sans } from 'next/font/google';
import Link from 'next/link';
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
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Dynamic Floating Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-[size:120px]" />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <Badge
                variant="secondary"
                className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple transition-all hover:scale-105 hover:bg-dynamic-purple/20 hover:shadow-dynamic-purple/20 hover:shadow-lg"
              >
                <Palette className="mr-1.5 h-3.5 w-3.5" />
                {t('branding.hero.badge')}
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
            >
              {t('branding.hero.title')}{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Guidelines
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-12 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl"
            >
              {t('branding.hero.description')}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Logos Section - Tuturuuu */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <div className="mb-6 flex items-center gap-4">
              <div className="flex-1">
                <h2 className="mb-2 font-bold text-3xl sm:text-4xl">
                  Tuturuuu{' '}
                  <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                    Logo
                  </span>
                </h2>
                <p className="text-foreground/70 text-lg">
                  {t('branding.logos.tuturuuu.description')}
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <LogoTab
                logoImage="/media/logos/dark-rounded.png"
                pngLink="/media/logos/dark-rounded.png"
                alt="Dark logo"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <LogoTab
                logoImage="/media/logos/light-rounded.png"
                pngLink="/media/logos/light-rounded.png"
                alt="Light logo"
                light
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Logos Section - Mira AI */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <div className="mb-6 flex items-center gap-4">
              <div className="flex-1">
                <h2 className="mb-2 font-bold text-3xl sm:text-4xl">
                  Mira AI{' '}
                  <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                    Logo
                  </span>
                </h2>
                <p className="text-foreground/70 text-lg">
                  {t('branding.logos.mira.description')}
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <LogoTab
                logoImage="/media/logos/mira-dark.png"
                pngLink="/media/logos/mira-dark.png"
                alt="Mira Dark logo"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <LogoTab
                logoImage="/media/logos/mira-light.png"
                pngLink="/media/logos/mira-light.png"
                alt="Mira Light logo"
                light
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Color System */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Color{' '}
              <span className="bg-linear-to-r from-dynamic-orange via-dynamic-red to-dynamic-pink bg-clip-text text-transparent">
                Palette
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('branding.colors.description')}
            </p>
          </motion.div>

          {/* Primary Colors */}
          <div className="mb-16">
            <motion.h3
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="mb-8 font-semibold text-2xl sm:text-3xl"
            >
              {t('branding.colors.primaryTitle')}
            </motion.h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {brandValues.map((value, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{
                    y: -8,
                    scale: 1.02,
                    transition: { duration: 0.2 },
                  }}
                >
                  <Card className="group h-full overflow-hidden border-border/50 shadow-sm transition-all duration-300 hover:shadow-lg">
                    <div
                      className="relative flex h-32 items-center justify-center p-4 text-white transition-all duration-300 group-hover:h-36"
                      style={{ backgroundColor: value.color }}
                    >
                      <span className="font-mono text-base">{value.color}</span>
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
                    <div className="space-y-2 p-5">
                      <h4 className="font-semibold text-lg">{value.title}</h4>
                      <p className="text-foreground/60 text-sm leading-relaxed">
                        {value.description}
                      </p>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          {/* System Colors */}
          <div>
            <motion.h3
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="mb-8 font-semibold text-2xl sm:text-3xl"
            >
              {t('branding.colors.systemTitle')}
            </motion.h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                >
                  <Card className="overflow-hidden border-border/50 shadow-sm transition-all duration-300 hover:shadow-lg">
                    <div
                      className={`relative flex h-32 items-center justify-center p-4 ${item.textColor}`}
                      style={{ backgroundColor: item.color }}
                    >
                      <span className="font-mono text-base">{item.color}</span>
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
                    <div className="p-5">
                      <h4 className="font-semibold text-lg">
                        {t(`branding.colors.system.${item.label}` as any)}
                      </h4>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Typography */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                Typography
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('branding.typography.description')}
            </p>
          </motion.div>

          <div className="grid gap-8 lg:gap-12">
            {typography.fonts.map((font, fontIndex) => (
              <motion.div
                key={fontIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3 }}
              >
                <Card className="overflow-hidden border-border/50 shadow-sm">
                  <div className="space-y-8 p-8 lg:p-12">
                    <div className="space-y-3">
                      <h3
                        className={`font-semibold text-3xl ${font.className}`}
                      >
                        {font.name}
                      </h3>
                      <p className="text-foreground/60 text-lg">{font.usage}</p>
                    </div>

                    <div className="grid gap-4">
                      {font.weights.map((weight, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.3 }}
                          whileHover={{ x: 5, transition: { duration: 0.2 } }}
                        >
                          <div className="group flex flex-col gap-3 rounded-xl bg-foreground/5 p-6 transition-all duration-300 hover:bg-foreground/10 sm:flex-row sm:items-center sm:justify-between">
                            <span
                              className={`text-xl ${font.className}`}
                              style={{
                                fontWeight: Number(weight.split(' ')[0]),
                              }}
                            >
                              The quick brown fox jumps over the lazy dog
                            </span>
                            <span className="font-medium text-base text-foreground/60">
                              {weight}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Usage Guidelines */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Usage{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                Guidelines
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('branding.guidelines.description')}
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: t('branding.guidelines.logo.title'),
                rules: [
                  t('branding.guidelines.logo.rule1'),
                  t('branding.guidelines.logo.rule2'),
                  t('branding.guidelines.logo.rule3'),
                  t('branding.guidelines.logo.rule4'),
                ],
                icon: Sparkles,
                color: 'purple',
              },
              {
                title: t('branding.guidelines.color.title'),
                rules: [
                  t('branding.guidelines.color.rule1'),
                  t('branding.guidelines.color.rule2'),
                  t('branding.guidelines.color.rule3'),
                  t('branding.guidelines.color.rule4'),
                ],
                icon: Palette,
                color: 'blue',
              },
              {
                title: t('branding.guidelines.typography.title'),
                rules: [
                  t('branding.guidelines.typography.rule1'),
                  t('branding.guidelines.typography.rule2'),
                  t('branding.guidelines.typography.rule3'),
                  t('branding.guidelines.typography.rule4'),
                ],
                icon: Type,
                color: 'green',
              },
            ].map((guideline, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
              >
                <Card
                  className={cn(
                    'group h-full p-8 transition-all hover:shadow-lg',
                    `border-dynamic-${guideline.color}/30 bg-linear-to-br from-dynamic-${guideline.color}/5 via-background to-background hover:border-dynamic-${guideline.color}/50 hover:shadow-dynamic-${guideline.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-6 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                      `bg-dynamic-${guideline.color}/10`
                    )}
                  >
                    <guideline.icon
                      className={cn(
                        'h-6 w-6',
                        `text-dynamic-${guideline.color}`
                      )}
                    />
                  </div>
                  <h3 className="mb-6 font-semibold text-2xl">
                    {guideline.title}
                  </h3>
                  <ul className="space-y-4">
                    {guideline.rules.map((rule, ruleIndex) => (
                      <li key={ruleIndex} className="flex items-start gap-3">
                        <span
                          className={cn(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            `bg-dynamic-${guideline.color}`
                          )}
                        />
                        <span className="text-base text-foreground/70">
                          {rule}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Download Assets CTA */}
      <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="relative overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12">
              {/* Decorative Elements */}
              <div className="absolute inset-0 overflow-hidden opacity-10">
                <div className="absolute top-10 left-10 h-40 w-40 rounded-full bg-dynamic-purple blur-3xl" />
                <div className="absolute right-20 bottom-20 h-40 w-40 rounded-full bg-dynamic-pink blur-3xl" />
              </div>

              <div className="relative text-center">
                <FileText className="mx-auto mb-6 h-16 w-16 text-dynamic-purple" />
                <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                  Need Brand Assets?
                </h2>
                <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed">
                  For press inquiries or partnership opportunities, contact us
                  for access to high-resolution logos, brand guidelines, and
                  media kits.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Button size="lg" asChild>
                    <Link href="/contact">
                      <Download className="mr-2 h-5 w-5" />
                      Request Assets
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/about">
                      Learn Our Story
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
};

export default BrandingPage;
