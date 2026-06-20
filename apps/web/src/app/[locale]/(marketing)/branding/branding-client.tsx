'use client';

import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FileText,
  Maximize2,
  Moon,
  Palette,
  Sparkles,
  Sun,
  Type,
} from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { Inter, Noto_Sans } from 'next/font/google';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const inter = Inter({ subsets: ['latin'] });
const notoSans = Noto_Sans({ subsets: ['latin', 'vietnamese'] });

const brandColors = [
  { token: 'innovation', color: '#4180E9' },
  { token: 'growth', color: '#4ACA3F' },
  { token: 'energy', color: '#FB7B05' },
  { token: 'impact', color: '#E94646' },
] as const;

const systemColors = [
  {
    color: '#09090B',
    token: 'backgroundDark',
    contentClassName: 'text-background dark:text-foreground',
  },
  {
    color: '#26292F',
    token: 'surfaceDark',
    contentClassName: 'text-background dark:text-foreground',
  },
  {
    color: '#FFFFFF',
    token: 'backgroundLight',
    contentClassName: 'text-foreground dark:text-background',
  },
  {
    color: '#363636',
    token: 'surfaceLight',
    contentClassName: 'text-background dark:text-foreground',
  },
] as const;

type PreviewMode = 'dark' | 'light' | 'monoDark' | 'monoLight';

const previewModes = [
  {
    key: 'dark',
    background: '#09090B',
    foreground: '#FFFFFF',
    icon: Moon,
  },
  {
    key: 'light',
    background: '#FFFFFF',
    foreground: '#09090B',
    icon: Sun,
  },
  {
    key: 'monoDark',
    background: '#09090B',
    foreground: '#FFFFFF',
    icon: Moon,
  },
  {
    key: 'monoLight',
    background: '#FFFFFF',
    foreground: '#09090B',
    icon: Sun,
  },
] as const satisfies ReadonlyArray<{
  key: PreviewMode;
  background: string;
  foreground: string;
  icon: typeof Moon;
}>;

const primaryAssets = [
  {
    key: 'brandMarkDark',
    src: '/media/branding/brand-mark-dark.svg',
    imageClassName: 'h-auto w-full max-w-2xl',
    monoClassName: 'aspect-[2369/512] w-full max-w-2xl',
    defaultMode: 'dark',
    locked: true,
  },
  {
    key: 'brandMarkLight',
    src: '/media/branding/brand-mark-light.svg',
    imageClassName: 'h-auto w-full max-w-2xl',
    monoClassName: 'aspect-[2369/512] w-full max-w-2xl',
    defaultMode: 'light',
    locked: true,
  },
] as const;

const productAssets = [
  {
    key: 'tuturuuu',
    src: '/media/branding/tuturuuu.svg',
    imageClassName: 'h-36 w-36',
    monoClassName: 'h-36 w-36',
    frameClassName: '',
  },
  {
    key: 'mira',
    src: '/media/branding/mira.svg',
    imageClassName: 'h-40 w-32',
    monoClassName: 'h-40 w-32',
    frameClassName: '',
  },
  {
    key: 'nova',
    src: '/media/branding/nova.svg',
    imageClassName: 'h-32 w-32',
    monoClassName: 'h-32 w-32',
    frameClassName: '',
  },
  {
    key: 'tudo',
    src: '/media/branding/tudo.svg',
    imageClassName: 'h-32 w-32',
    monoClassName: 'h-32 w-32',
    frameClassName: '',
  },
  {
    key: 'rewise',
    src: '/media/branding/rewise.svg',
    imageClassName: 'h-28 w-36',
    monoClassName: 'h-28 w-36',
    frameClassName: '',
  },
  {
    key: 'gaming',
    src: '/media/branding/gaming.svg',
    imageClassName: 'h-28 w-36',
    monoClassName: 'h-28 w-36',
    frameClassName: '',
  },
] as const;

const summaryKeys = ['assets', 'colors', 'rules'] as const;

const guidelineCards = [
  {
    key: 'logo',
    icon: Sparkles,
    lineClassName: 'bg-dynamic-purple',
    tintClassName: 'text-dynamic-purple',
  },
  {
    key: 'color',
    icon: Palette,
    lineClassName: 'bg-dynamic-blue',
    tintClassName: 'text-dynamic-blue',
  },
  {
    key: 'typography',
    icon: Type,
    lineClassName: 'bg-dynamic-green',
    tintClassName: 'text-dynamic-green',
  },
] as const;

export default function BrandingClient() {
  const t = useTranslations('branding');
  const reduceMotion = useReducedMotion();
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const copyToClipboard = (value: string, message: string) => {
    navigator.clipboard.writeText(value);
    setCopiedValue(value);
    toast.success(message);
    setTimeout(() => setCopiedValue(null), 2000);
  };

  const typography = [
    {
      name: 'Inter',
      className: inter.className,
      usage: t('typography.inter.usage'),
      sample: t('typography.sampleLatin'),
      weights: ['400 Regular', '500 Medium', '600 Semibold', '700 Bold'],
    },
    {
      name: 'Noto Sans',
      className: notoSans.className,
      usage: t('typography.notoSans.usage'),
      sample: t('typography.sampleVietnamese'),
      weights: ['400 Regular', '500 Medium', '600 Semibold', '700 Bold'],
    },
  ];

  return (
    <main className="relative overflow-hidden text-pretty bg-root-background text-foreground">
      <style>{`
        @supports (scroll-snap-type: y proximity) {
          [data-brand-snap='true'] {
            scroll-margin-top: 5rem;
          }
        }
      `}</style>
      <section
        className="relative isolate overflow-hidden border-border border-b px-4 pt-16 pb-8 sm:px-6 lg:px-8"
        data-brand-snap="true"
      >
        <BrandIntroTransition reduceMotion={reduceMotion} />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 py-12 lg:min-h-[calc(100dvh-18rem)] lg:grid-cols-[0.95fr_0.72fr] lg:py-16">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl space-y-8"
            initial={{ opacity: 0, y: 28 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="space-y-7">
              <h1 className="max-w-5xl text-pretty font-semibold text-5xl tracking-tight sm:text-7xl lg:text-[6.75rem] lg:leading-[0.88]">
                {t('hero.title')}{' '}
                <span className="block pl-[0.02em] text-dynamic-blue">
                  {t('hero.titleAccent')}
                </span>
              </h1>
              <p className="max-w-2xl text-foreground/62 text-lg leading-8 sm:text-xl">
                {t('hero.description')}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="justify-center" size="lg">
                <Link href="#brand-assets">
                  <Download className="mr-2 h-5 w-5" />
                  {t('hero.primaryAction')}
                </Link>
              </Button>
              <Button
                asChild
                className="justify-center border-border bg-background/40 text-foreground hover:bg-muted hover:text-foreground"
                size="lg"
                variant="outline"
              >
                <Link href="/contact">
                  {t('hero.secondaryAction')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </motion.div>

          <HeroBrandStage reduceMotion={reduceMotion} />
        </div>

        <div className="mx-auto grid max-w-7xl border-border border-t md:grid-cols-3">
          {summaryKeys.map((key, index) => (
            <div
              className="border-border border-b py-6 md:border-r md:border-b-0 md:px-8 md:last:border-r-0 md:first:pl-0"
              key={key}
            >
              <p className="mb-4 font-medium text-dynamic-blue text-sm">
                {t(`summary.${key}.eyebrow` as any)}
              </p>
              <h2 className="mb-3 font-semibold text-2xl">
                {t(`summary.${key}.title` as any)}
              </h2>
              <p className="max-w-sm text-foreground/54 leading-7">
                {t(`summary.${key}.description` as any)}
              </p>
              <div
                className="mt-6 h-1 w-20"
                style={{
                  backgroundColor: brandColors[index]?.color ?? '#4180E9',
                }}
              />
            </div>
          ))}
        </div>

        <KineticAssetStrip
          getName={(key) => t(`assets.${key}.name` as any)}
          items={productAssets}
        />
      </section>

      <section
        className="min-h-[calc(100dvh-5rem)] scroll-mt-20 bg-root-background px-4 py-24 text-foreground sm:px-6 lg:px-8"
        data-brand-snap="true"
        id="brand-assets"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            description={t('assets.description')}
            eyebrow={t('assets.eyebrow')}
            title={t('assets.title')}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            {primaryAssets.map((asset) => (
              <AssetPanel
                copyLabel={t('assetActions.copyPath')}
                copied={copiedValue === asset.src}
                copiedLabel={t('assetActions.copiedPath')}
                defaultMode={asset.defaultMode}
                downloadLabel={t('assetActions.downloadSvg')}
                imageClassName={asset.imageClassName}
                key={asset.key}
                locked={asset.locked}
                monoClassName={asset.monoClassName}
                name={t(`assets.${asset.key}.name` as any)}
                onCopy={() =>
                  copyToClipboard(
                    asset.src,
                    t('assetActions.pathCopied', { path: asset.src })
                  )
                }
                previewLabels={{
                  dark: t('preview.dark'),
                  description: t('preview.description', {
                    name: t(`assets.${asset.key}.name` as any),
                  }),
                  fullscreen: t('preview.fullscreen'),
                  light: t('preview.light'),
                  monoDark: t('preview.monoDark'),
                  monoLight: t('preview.monoLight'),
                  title: t('preview.title'),
                }}
                src={asset.src}
              />
            ))}
          </div>

          <div className="mt-5 grid auto-rows-[17rem] gap-5 md:grid-cols-3">
            {productAssets.map((asset, index) => (
              <ProductMark
                copyLabel={t('assetActions.copyPath')}
                copied={copiedValue === asset.src}
                copiedLabel={t('assetActions.copiedPath')}
                frameClassName={asset.frameClassName}
                imageClassName={asset.imageClassName}
                index={index}
                key={asset.key}
                monoClassName={asset.monoClassName}
                name={t(`assets.${asset.key}.name` as any)}
                onCopy={() =>
                  copyToClipboard(
                    asset.src,
                    t('assetActions.pathCopied', { path: asset.src })
                  )
                }
                previewLabels={{
                  dark: t('preview.dark'),
                  description: t('preview.description', {
                    name: t(`assets.${asset.key}.name` as any),
                  }),
                  fullscreen: t('preview.fullscreen'),
                  light: t('preview.light'),
                  monoDark: t('preview.monoDark'),
                  monoLight: t('preview.monoLight'),
                  title: t('preview.title'),
                }}
                downloadLabel={t('assetActions.downloadSvg')}
                src={asset.src}
              />
            ))}
          </div>
        </div>
      </section>

      <section
        className="relative min-h-[calc(100dvh-5rem)] overflow-hidden bg-background px-4 py-20 text-foreground sm:px-6 lg:px-8"
        data-brand-snap="true"
        id="color-system"
      >
        <div className="absolute inset-x-0 top-0 h-1.5 grid-cols-4 sm:grid">
          {brandColors.map((item) => (
            <div key={item.color} style={{ backgroundColor: item.color }} />
          ))}
        </div>

        <div className="mx-auto max-w-7xl">
          <SectionHeader
            description={t('colors.description')}
            eyebrow={t('colors.eyebrow')}
            inverted
            title={t('colors.title')}
          />

          <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="grid gap-4 sm:grid-cols-2">
              {brandColors.map((value, index) => (
                <ColorTokenCard
                  copied={copiedValue === value.color}
                  color={value.color}
                  description={t(`colors.primary.${value.token}.description`)}
                  index={index + 1}
                  key={value.color}
                  onCopy={() =>
                    copyToClipboard(
                      value.color,
                      t('colorCopied', { color: value.color })
                    )
                  }
                  title={t(`colors.primary.${value.token}.title`)}
                />
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {systemColors.map((item) => (
                <SystemTokenCard
                  contentClassName={item.contentClassName}
                  copied={copiedValue === item.color}
                  color={item.color}
                  key={item.color}
                  onCopy={() =>
                    copyToClipboard(
                      item.color,
                      t('colorCopied', { color: item.color })
                    )
                  }
                  title={t(`colors.system.${item.token}`)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="min-h-[calc(100dvh-5rem)] bg-root-background px-4 py-24 text-foreground sm:px-6 lg:px-8"
        data-brand-snap="true"
        id="typography"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            description={t('typography.description')}
            eyebrow={t('typography.eyebrow')}
            title={t('typography.title')}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            {typography.map((font) => (
              <div
                className="overflow-hidden rounded-lg border border-border bg-background"
                key={font.name}
              >
                <div className="grid min-h-72 place-items-center border-border border-b bg-foreground p-8 text-background">
                  <p
                    className={cn(
                      'max-w-xl text-balance text-center font-semibold text-5xl tracking-tight sm:text-6xl',
                      font.className
                    )}
                  >
                    Aa
                  </p>
                </div>
                <div className="p-6">
                  <h3 className={cn('font-semibold text-3xl', font.className)}>
                    {font.name}
                  </h3>
                  <p className="mt-3 text-foreground/60 leading-7">
                    {font.usage}
                  </p>
                  <div className="mt-8 space-y-4">
                    {font.weights.map((weight) => (
                      <div
                        className="grid gap-3 border-border border-t pt-4 sm:grid-cols-[1fr_auto]"
                        key={`${font.name}-${weight}`}
                      >
                        <p
                          className={cn(
                            'text-pretty text-2xl leading-8',
                            font.className
                          )}
                          style={{ fontWeight: Number(weight.split(' ')[0]) }}
                        >
                          {font.sample}
                        </p>
                        <p className="font-medium text-foreground/45 text-sm">
                          {weight}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="min-h-[calc(100dvh-5rem)] bg-background px-4 py-24 text-foreground sm:px-6 lg:px-8"
        data-brand-snap="true"
        id="usage-guidelines"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            description={t('guidelines.description')}
            eyebrow={t('guidelines.eyebrow')}
            inverted
            title={t('guidelines.title')}
          />

          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
            {guidelineCards.map((guideline) => (
              <div className="bg-background p-7" key={guideline.key}>
                <div
                  className={cn('mb-10 h-1 w-16', guideline.lineClassName)}
                />
                <guideline.icon
                  className={cn('mb-6 h-7 w-7', guideline.tintClassName)}
                />
                <h3 className="mb-6 font-semibold text-2xl">
                  {t(`guidelines.${guideline.key}.title` as any)}
                </h3>
                <ul className="space-y-4">
                  {[1, 2, 3, 4].map((rule) => (
                    <li
                      className="grid grid-cols-[1.5rem_1fr] gap-3 text-foreground/62 leading-7"
                      key={rule}
                    >
                      <span className="font-medium text-foreground/30 text-sm">
                        0{rule}
                      </span>
                      <span>
                        {t(`guidelines.${guideline.key}.rule${rule}` as any)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="bg-root-background px-4 py-24 text-foreground sm:px-6 lg:px-8"
        data-brand-snap="true"
        id="media-kit"
      >
        <div className="mx-auto grid max-w-7xl items-end gap-10 border-border border-y py-14 md:grid-cols-[1fr_auto]">
          <div>
            <FileText className="mb-8 h-12 w-12 text-foreground/50" />
            <h2 className="max-w-3xl text-pretty font-semibold text-4xl tracking-tight sm:text-6xl">
              {t('cta.title')}
            </h2>
            <p className="mt-5 max-w-2xl text-foreground/58 text-lg leading-8">
              {t('cta.description')}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="justify-center" size="lg">
              <Link href="/contact">
                <Download className="mr-2 h-5 w-5" />
                {t('cta.primaryAction')}
              </Link>
            </Button>
            <Button
              asChild
              className="justify-center"
              size="lg"
              variant="outline"
            >
              <Link href="/about">
                {t('cta.secondaryAction')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHeader({
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

function HeroBrandStage({ reduceMotion }: { reduceMotion: boolean | null }) {
  const blobs = [
    { color: brandColors[0].color, className: 'top-10 left-16 h-40 w-40' },
    { color: brandColors[1].color, className: 'top-20 right-10 h-36 w-36' },
    { color: brandColors[2].color, className: 'bottom-8 left-24 h-44 w-44' },
    { color: brandColors[3].color, className: 'right-20 bottom-16 h-32 w-32' },
  ];

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="relative hidden min-h-[27rem] lg:block"
      initial={{ opacity: 0, x: 32 }}
      transition={{ delay: 0.15, duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
    >
      {blobs.map((blob, index) => (
        <motion.div
          animate={
            reduceMotion
              ? undefined
              : {
                  opacity: [0.18, 0.34, 0.18],
                  scale: [0.96, 1.06, 0.96],
                  x: [0, index % 2 === 0 ? 10 : -10, 0],
                  y: [0, index < 2 ? -8 : 8, 0],
                }
          }
          className={cn(
            'absolute rounded-full blur-3xl will-change-transform',
            blob.className
          )}
          key={blob.color}
          style={{ backgroundColor: blob.color }}
          transition={{
            delay: index * 0.18,
            duration: 5 + index * 0.35,
            ease: 'easeInOut',
            repeat: Infinity,
          }}
        />
      ))}

      <div
        aria-hidden
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage:
            'radial-gradient(circle at center, black 0 62%, transparent 78%)',
        }}
      />
      <div className="absolute inset-8 rounded-[42%] border border-border/80" />
      <div className="absolute inset-16 rounded-full border border-border/70" />
      <div className="absolute inset-24 rounded-full border border-border/60" />
      <div className="absolute top-1/2 right-4 left-4 h-px bg-border/80" />
      <div className="absolute top-4 bottom-4 left-1/2 w-px bg-border/80" />
      <div className="absolute top-14 left-14 h-12 w-12 border-border border-t border-l" />
      <div className="absolute top-14 right-14 h-12 w-12 border-border border-t border-r" />
      <div className="absolute bottom-14 left-14 h-12 w-12 border-border border-b border-l" />
      <div className="absolute right-14 bottom-14 h-12 w-12 border-border border-r border-b" />

      <motion.div
        animate={
          reduceMotion
            ? undefined
            : {
                rotate: [0, -1.2, 1.2, 0],
                scale: [1, 1.025, 1],
                y: [0, -8, 0],
              }
        }
        className="absolute inset-0 grid place-items-center"
        transition={{
          duration: 6.8,
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: local branding SVG stays native to keep this dev route off next/image. */}
        <img
          alt=""
          className="relative h-48 w-48 object-contain drop-shadow-[0_24px_36px_rgba(0,0,0,0.18)]"
          height={192}
          loading="eager"
          src="/media/branding/tuturuuu.svg"
          width={192}
        />
      </motion.div>
    </motion.div>
  );
}

function BrandIntroTransition({
  reduceMotion,
}: {
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      animate={reduceMotion ? { opacity: 0 } : { opacity: [1, 1, 0] }}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden bg-root-background"
      initial={{ opacity: reduceMotion ? 0 : 1 }}
      transition={{ delay: reduceMotion ? 0 : 1.28, duration: 0.3 }}
    >
      <div className="absolute top-1/2 left-1/2 grid h-[160vh] w-[160vw] -translate-x-1/2 -translate-y-1/2 rotate-[-13deg] grid-rows-4">
        {brandColors.map((item, index) => (
          <motion.div
            animate={{
              x: reduceMotion
                ? '130vw'
                : [
                    index % 2 === 0 ? '-132vw' : '132vw',
                    '0vw',
                    '0vw',
                    index % 2 === 0 ? '132vw' : '-132vw',
                  ],
              y: reduceMotion
                ? '0vh'
                : [
                    index % 2 === 0 ? '2vh' : '-2vh',
                    '0vh',
                    '0vh',
                    index % 2 === 0 ? '-2vh' : '2vh',
                  ],
            }}
            initial={{
              x: reduceMotion ? '130vw' : index % 2 === 0 ? '-132vw' : '132vw',
              y: reduceMotion ? '0vh' : index % 2 === 0 ? '2vh' : '-2vh',
            }}
            key={item.color}
            style={{ backgroundColor: item.color }}
            transition={{
              delay: reduceMotion ? 0 : index * 0.07,
              duration: reduceMotion ? 0.01 : 1.65,
              ease: [0.16, 1, 0.3, 1],
              times: [0, 0.28, 0.62, 1],
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function KineticAssetStrip({
  getName,
  items,
}: {
  getName: (key: (typeof productAssets)[number]['key']) => string;
  items: typeof productAssets;
}) {
  const loopItems = [...items, ...items];

  return (
    <div
      aria-hidden
      className="relative left-1/2 mt-10 w-screen -translate-x-1/2 overflow-hidden border-border border-y py-3"
    >
      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        className="flex w-max gap-2"
        transition={{
          duration: 28,
          ease: 'linear',
          repeat: Infinity,
        }}
      >
        {loopItems.map((asset, index) => (
          <div
            className="flex h-16 w-52 shrink-0 items-center gap-3 border-border border-x bg-background/55 px-5"
            key={`${asset.key}-${index}`}
          >
            {/* biome-ignore lint/performance/noImgElement: local branding SVGs stay native to keep this dev route off next/image. */}
            <img
              alt=""
              className="h-8 w-8 object-contain"
              height={32}
              src={asset.src}
              width={32}
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-base">
                {getName(asset.key)}
              </p>
              <div
                className="mt-2 h-1 w-16 rounded-full"
                style={{
                  backgroundColor:
                    brandColors[index % brandColors.length]?.color ?? '#4180E9',
                }}
              />
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

type PreviewLabels = Record<PreviewMode, string> & {
  description: string;
  fullscreen: string;
  title: string;
};

function BrandPreview({
  imageClassName,
  locked = false,
  labels,
  mode,
  monoClassName,
  name,
  onModeChange,
  previewClassName,
  src,
  wide = false,
}: {
  imageClassName: string;
  locked?: boolean;
  labels: PreviewLabels;
  mode: PreviewMode;
  monoClassName: string;
  name: string;
  onModeChange: (mode: PreviewMode) => void;
  previewClassName: string;
  src: string;
  wide?: boolean;
}) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const activeMode =
    previewModes.find((previewMode) => previewMode.key === mode) ??
    previewModes[0];

  return (
    <>
      <div
        className={cn(
          'group/brand-preview relative grid place-items-center overflow-hidden rounded-md border border-border p-7',
          previewClassName
        )}
        style={{ backgroundColor: activeMode.background }}
      >
        {!locked && (
          <PreviewModeControls
            activeMode={mode}
            floating
            labels={labels}
            onModeChange={onModeChange}
          />
        )}
        <Button
          aria-label={labels.fullscreen}
          className="absolute top-3 right-3 z-30 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 group-focus-within/brand-preview:opacity-100 group-hover/brand-preview:opacity-100"
          onClick={() => setFullscreenOpen(true)}
          size="icon"
          type="button"
          variant="outline"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <button
          aria-label={labels.fullscreen}
          className="grid place-items-center focus-visible:outline-none"
          onClick={() => setFullscreenOpen(true)}
          type="button"
        >
          <motion.span
            animate={{ scale: [1, 1.025, 1] }}
            className="pointer-events-none grid place-items-center"
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <PreviewAssetVisual
              imageClassName={imageClassName}
              mode={activeMode}
              monoClassName={monoClassName}
              name={name}
              src={src}
            />
          </motion.span>
        </button>
      </div>

      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_1fr] overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]">
          <div className="flex flex-col gap-4 border-border border-b p-4 pr-14 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle>
              {name} {labels.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {labels.description}
            </DialogDescription>
            {!locked && (
              <PreviewModeControls
                activeMode={mode}
                alwaysVisible
                labels={labels}
                onModeChange={onModeChange}
              />
            )}
          </div>
          <div
            className="grid min-h-0 place-items-center overflow-hidden p-6"
            style={{ backgroundColor: activeMode.background }}
          >
            <PreviewAssetVisual
              fullscreen
              imageClassName={
                wide
                  ? 'h-auto w-[min(82vw,72rem)]'
                  : 'h-[min(54vh,28rem)] w-[min(54vh,28rem)]'
              }
              mode={activeMode}
              monoClassName={
                wide
                  ? 'aspect-[2369/512] w-[min(82vw,72rem)]'
                  : 'h-[min(54vh,28rem)] w-[min(54vh,28rem)]'
              }
              name={name}
              src={src}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewModeControls({
  activeMode,
  alwaysVisible = false,
  floating = false,
  labels,
  onModeChange,
}: {
  activeMode: PreviewMode;
  alwaysVisible?: boolean;
  floating?: boolean;
  labels: PreviewLabels;
  onModeChange: (mode: PreviewMode) => void;
}) {
  return (
    <div
      className={cn(
        'group/theme-picker z-30 flex overflow-hidden rounded-md border border-border bg-background/80 p-1 backdrop-blur-sm transition-all duration-200',
        alwaysVisible
          ? 'opacity-100'
          : 'opacity-0 focus-within:opacity-100 hover:opacity-100 group-focus-within/brand-preview:opacity-100 group-hover/brand-preview:opacity-100',
        floating && 'absolute top-3 left-3'
      )}
    >
      {previewModes.map((mode) => {
        const Icon = mode.icon;
        const active = activeMode === mode.key;

        return (
          <button
            aria-label={labels[mode.key]}
            className={cn(
              'inline-flex h-8 items-center justify-center overflow-hidden rounded-sm font-medium text-xs transition-all duration-200',
              active
                ? 'w-8 bg-foreground px-2 text-background'
                : 'pointer-events-none w-0 px-0 text-foreground/65 opacity-0 hover:bg-muted hover:text-foreground group-focus-within/theme-picker:pointer-events-auto group-focus-within/theme-picker:w-8 group-focus-within/theme-picker:px-2 group-focus-within/theme-picker:opacity-100 group-hover/theme-picker:pointer-events-auto group-hover/theme-picker:w-8 group-hover/theme-picker:px-2 group-hover/theme-picker:opacity-100'
            )}
            key={mode.key}
            onClick={() => onModeChange(mode.key)}
            title={labels[mode.key]}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="sr-only">{labels[mode.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

function PreviewAssetVisual({
  fullscreen = false,
  imageClassName,
  mode,
  monoClassName,
  name,
  src,
}: {
  fullscreen?: boolean;
  imageClassName: string;
  mode: (typeof previewModes)[number];
  monoClassName: string;
  name: string;
  src: string;
}) {
  const monochrome = mode.key === 'monoDark' || mode.key === 'monoLight';

  if (monochrome) {
    return (
      <div
        aria-label={name}
        className={cn(
          'pointer-events-none shrink-0 select-none',
          monoClassName
        )}
        role="img"
        style={{
          backgroundColor: mode.foreground,
          mask: `url(${src}) center / contain no-repeat`,
          WebkitMask: `url(${src}) center / contain no-repeat`,
        }}
      />
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: local branding assets stay native to keep this dev route off next/image.
    <img
      alt={name}
      className={cn(
        'pointer-events-none select-none object-contain',
        fullscreen
          ? 'drop-shadow-[0_20px_40px_rgba(0,0,0,0.18)]'
          : 'drop-shadow-[0_20px_35px_rgba(0,0,0,0.14)]',
        imageClassName
      )}
      height={fullscreen ? 520 : 240}
      src={src}
      width={fullscreen ? 1200 : 760}
    />
  );
}

function AssetPanel({
  copied,
  copiedLabel,
  copyLabel,
  defaultMode,
  downloadLabel,
  imageClassName,
  locked,
  monoClassName,
  name,
  onCopy,
  previewLabels,
  src,
}: {
  copied: boolean;
  copiedLabel: string;
  copyLabel: string;
  defaultMode: PreviewMode;
  downloadLabel: string;
  imageClassName: string;
  locked: boolean;
  monoClassName: string;
  name: string;
  onCopy: () => void;
  previewLabels: PreviewLabels;
  src: string;
}) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>(defaultMode);

  return (
    <motion.div
      className="overflow-hidden rounded-lg border border-border bg-background"
      initial={{ opacity: 0, y: 28 }}
      transition={{ duration: 0.45 }}
      viewport={{ once: true, margin: '-90px' }}
      whileHover={{ scale: 1.01, y: -4 }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <BrandPreview
        imageClassName={imageClassName}
        labels={previewLabels}
        locked={locked}
        mode={previewMode}
        monoClassName={monoClassName}
        name={name}
        onModeChange={setPreviewMode}
        previewClassName="min-h-[22rem]"
        src={src}
        wide
      />
      <AssetActions
        copied={copied}
        copiedLabel={copiedLabel}
        copyLabel={copyLabel}
        downloadLabel={downloadLabel}
        name={name}
        onCopy={onCopy}
        src={src}
      />
    </motion.div>
  );
}

function ProductMark({
  copied,
  copiedLabel,
  copyLabel,
  downloadLabel,
  frameClassName,
  imageClassName,
  index,
  monoClassName,
  name,
  onCopy,
  previewLabels,
  src,
}: {
  copied: boolean;
  copiedLabel: string;
  copyLabel: string;
  downloadLabel: string;
  frameClassName: string;
  imageClassName: string;
  index: number;
  monoClassName: string;
  name: string;
  onCopy: () => void;
  previewLabels: PreviewLabels;
  src: string;
}) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('dark');

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
      transition={{ delay: index * 0.05, duration: 0.45 }}
      viewport={{ once: true, margin: '-80px' }}
      whileHover={{ rotate: 0, scale: 1.015, y: -4 }}
      whileInView={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative grid grid-rows-[1fr_auto] overflow-hidden rounded-lg border border-border bg-background p-5',
        frameClassName
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--border)_0_1px,transparent_1px_32px)] opacity-70" />
      <BrandPreview
        imageClassName={imageClassName}
        labels={previewLabels}
        mode={previewMode}
        monoClassName={monoClassName}
        name={name}
        onModeChange={setPreviewMode}
        previewClassName="min-h-0"
        src={src}
      />
      <div className="relative mt-auto flex items-center justify-between gap-3 border-border border-t pt-4">
        <h3 className="font-semibold text-lg">{name}</h3>
        <div className="flex gap-2">
          <Button
            aria-label={copied ? copiedLabel : copyLabel}
            onClick={onCopy}
            size="icon"
            type="button"
            variant="outline"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button asChild size="icon" variant="secondary">
            <a aria-label={downloadLabel} download href={src}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function AssetActions({
  copied,
  copiedLabel,
  copyLabel,
  downloadLabel,
  name,
  onCopy,
  src,
}: {
  copied: boolean;
  copiedLabel: string;
  copyLabel: string;
  downloadLabel: string;
  name: string;
  onCopy: () => void;
  src: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-border border-t p-5 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="font-semibold text-xl">{name}</h3>
      <div className="flex gap-2">
        <Button
          aria-label={copied ? copiedLabel : copyLabel}
          onClick={onCopy}
          size="icon"
          type="button"
          variant="outline"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button asChild size="sm" variant="secondary">
          <a download href={src}>
            <Download className="mr-2 h-4 w-4" />
            {downloadLabel}
          </a>
        </Button>
      </div>
    </div>
  );
}

function ColorTokenCard({
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

function SystemTokenCard({
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
