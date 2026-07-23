'use client';

import { ArrowRight, Download, FileText } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { Inter, Noto_Sans } from 'next/font/google';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AssetPanel, ProductMark } from './brand-assets';
import {
  brandColors,
  guidelineCards,
  primaryAssets,
  productAssets,
  summaryKeys,
  systemColors,
} from './brand-data';
import {
  BrandIntroTransition,
  HeroBrandStage,
  KineticAssetStrip,
} from './brand-stage';
import { ColorTokenCard, SectionHeader, SystemTokenCard } from './brand-tokens';

const inter = Inter({ subsets: ['latin'] });
const notoSans = Noto_Sans({ subsets: ['latin', 'vietnamese'] });

/**
 * Brand guidelines: marks, colour, type and the downloadable kit.
 *
 * The page's own design is deliberate and stays as it was; what changed is the
 * shape of the file. It was a single 1,343-line client component, well over
 * the repo's hard ceiling, so the stage, preview, asset and token pieces now
 * live in siblings and this file is the composition.
 */

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
