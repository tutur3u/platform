'use client';

import { ArrowRight, Download, FileText } from '@tuturuuu/icons/lucide';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useReducedMotion } from 'framer-motion';
import { Inter, Noto_Sans } from 'next/font/google';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';
import { ActionLink } from '@/components/marketing/action-link';
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
  BrandIntroSweep,
  HeroBrandStage,
  KineticAssetStrip,
} from './brand-stage';
import { ColorTokenCard, SectionHeader, SystemTokenCard } from './brand-tokens';
import { TypeSpecimen } from './brand-typography';

const inter = Inter({ subsets: ['latin'] });
const notoSans = Noto_Sans({ subsets: ['latin', 'vietnamese'] });

/**
 * Brand guidelines: marks, colour, type and the downloadable kit.
 *
 * Rebuilt onto the marketing system. Three structural things changed beyond
 * the styling. The page alternated `bg-root-background` and `bg-background`
 * section by section, which banded the whole scroll into visible stripes;
 * there is now one substrate with hairline rules, like every other marketing
 * page. Four sections were pinned to `min-h-[calc(100dvh-5rem)]` regardless of
 * how much they contained, so short sections opened huge voids on a desktop
 * display; they are sized by their content now. And the scroll-margin rule
 * that shipped as an inline `<style>` block is a utility class.
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

  const typefaces = [
    {
      className: inter.className,
      name: 'Inter',
      sample: t('typography.sampleLatin'),
      usage: t('typography.inter.usage'),
      weights: ['400 Regular', '500 Medium', '600 Semibold', '700 Bold'],
    },
    {
      className: notoSans.className,
      name: 'Noto Sans',
      sample: t('typography.sampleVietnamese'),
      usage: t('typography.notoSans.usage'),
      weights: ['400 Regular', '500 Medium', '600 Semibold', '700 Bold'],
    },
  ];

  const previewLabelsFor = (name: string) => ({
    dark: t('preview.dark'),
    description: t('preview.description', { name }),
    fullscreen: t('preview.fullscreen'),
    light: t('preview.light'),
    monoDark: t('preview.monoDark'),
    monoLight: t('preview.monoLight'),
    title: t('preview.title'),
  });

  return (
    <main className="relative w-full overflow-x-hidden text-pretty">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <BrandIntroSweep reduceMotion={reduceMotion} />
        <HeroAtmosphere />

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-[1fr_0.85fr]">
          <div>
            <span className="inline-flex animate-rise-in items-center rounded-full border border-dynamic-blue/25 bg-dynamic-blue/10 px-4 py-1.5 font-mono-ui text-[0.65rem] text-dynamic-blue uppercase tracking-[0.2em] backdrop-blur-md">
              {t('hero.badge')}
            </span>

            <h1
              className="mt-8 animate-rise-in text-balance font-display font-extrabold text-5xl leading-[0.95] tracking-[-0.045em] sm:text-7xl lg:text-[5.5rem]"
              style={{ animationDelay: '90ms' }}
            >
              {t('hero.title')}{' '}
              <span className="block text-dynamic-blue">
                {t('hero.titleAccent')}
              </span>
            </h1>

            <p
              className="mt-7 max-w-xl animate-rise-in text-balance text-foreground/55 text-lg leading-relaxed"
              style={{ animationDelay: '180ms' }}
            >
              {t('hero.description')}
            </p>

            <div
              className="mt-9 flex animate-rise-in flex-col gap-3 sm:flex-row"
              style={{ animationDelay: '270ms' }}
            >
              <ActionLink href="#brand-assets">
                <Download className="h-4 w-4" />
                {t('hero.primaryAction')}
              </ActionLink>
              <ActionLink href="/contact" variant="ghost">
                {t('hero.secondaryAction')}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </ActionLink>
            </div>
          </div>

          <HeroBrandStage
            readings={{
              clearSpace: t('plate.clearSpaceLabel'),
              clearSpaceValue: t('plate.clearSpaceValue'),
              format: t('plate.formatLabel'),
              minWidth: t('plate.minWidthLabel'),
            }}
            reduceMotion={reduceMotion}
          />
        </div>

        {/* Summary rail: the three things this page gives you. */}
        <div className="relative mx-auto mt-20 grid w-full max-w-7xl divide-y divide-foreground/[0.07] overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] md:grid-cols-3 md:divide-x md:divide-y-0">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-24 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
          />
          {summaryKeys.map((key, index) => (
            <div className="p-7" key={key}>
              <div className="flex items-center gap-3">
                <span
                  className="h-1 w-8 rounded-full"
                  style={{
                    backgroundColor:
                      brandColors[index]?.color ?? brandColors[0].color,
                  }}
                />
                <p className="font-mono-ui text-[0.62rem] text-foreground/40 uppercase tracking-[0.18em]">
                  {t(`summary.${key}.eyebrow` as never)}
                </p>
              </div>
              <h2 className="mt-5 font-display font-semibold text-2xl tracking-[-0.02em]">
                {t(`summary.${key}.title` as never)}
              </h2>
              <p className="mt-3 text-foreground/55 leading-relaxed">
                {t(`summary.${key}.description` as never)}
              </p>
            </div>
          ))}
        </div>

        <KineticAssetStrip
          getName={(key) => t(`assets.${key}.name` as never)}
          items={productAssets}
        />
      </section>

      {/* ── Assets ───────────────────────────────────────────────────────── */}
      <BrandSection id="brand-assets">
        <SectionHeader
          description={t('assets.description')}
          eyebrow={t('assets.eyebrow')}
          index="01"
          title={t('assets.title')}
        />

        <div className="grid gap-5 lg:grid-cols-2">
          {primaryAssets.map((asset) => {
            const name = t(`assets.${asset.key}.name` as never);

            return (
              <AssetPanel
                copied={copiedValue === asset.src}
                copiedLabel={t('assetActions.copiedPath')}
                copyLabel={t('assetActions.copyPath')}
                defaultMode={asset.defaultMode}
                downloadLabel={t('assetActions.downloadSvg')}
                imageClassName={asset.imageClassName}
                key={asset.key}
                locked={asset.locked}
                monoClassName={asset.monoClassName}
                name={name}
                onCopy={() =>
                  copyToClipboard(
                    asset.src,
                    t('assetActions.pathCopied', { path: asset.src })
                  )
                }
                previewLabels={previewLabelsFor(name)}
                src={asset.src}
              />
            );
          })}
        </div>

        <div className="mt-5 grid auto-rows-[17rem] gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {productAssets.map((asset, index) => {
            const name = t(`assets.${asset.key}.name` as never);

            return (
              <ProductMark
                copied={copiedValue === asset.src}
                copiedLabel={t('assetActions.copiedPath')}
                copyLabel={t('assetActions.copyPath')}
                downloadLabel={t('assetActions.downloadSvg')}
                frameClassName={asset.frameClassName}
                imageClassName={asset.imageClassName}
                index={index}
                key={asset.key}
                monoClassName={asset.monoClassName}
                name={name}
                onCopy={() =>
                  copyToClipboard(
                    asset.src,
                    t('assetActions.pathCopied', { path: asset.src })
                  )
                }
                previewLabels={previewLabelsFor(name)}
                src={asset.src}
              />
            );
          })}
        </div>
      </BrandSection>

      {/* ── Colour ───────────────────────────────────────────────────────── */}
      <BrandSection id="color-system">
        <SectionHeader
          description={t('colors.description')}
          eyebrow={t('colors.eyebrow')}
          index="02"
          title={t('colors.title')}
        />

        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {brandColors.map((value, index) => (
              <ColorTokenCard
                color={value.color}
                copied={copiedValue === value.color}
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
                color={item.color}
                contentClassName={item.contentClassName}
                copied={copiedValue === item.color}
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
      </BrandSection>

      {/* ── Typography ───────────────────────────────────────────────────── */}
      <BrandSection id="typography">
        <SectionHeader
          description={t('typography.description')}
          eyebrow={t('typography.eyebrow')}
          index="03"
          title={t('typography.title')}
        />

        <div className="grid gap-5 lg:grid-cols-2">
          {typefaces.map((face) => (
            <TypeSpecimen
              face={face}
              key={face.name}
              weightsLabel={t('typography.weightsLabel')}
            />
          ))}
        </div>
      </BrandSection>

      {/* ── Guidelines ───────────────────────────────────────────────────── */}
      <BrandSection id="usage-guidelines">
        <SectionHeader
          description={t('guidelines.description')}
          eyebrow={t('guidelines.eyebrow')}
          index="04"
          title={t('guidelines.title')}
        />

        <div className="grid gap-5 md:grid-cols-3">
          {guidelineCards.map((guideline) => (
            <div
              className="group relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/[0.18]"
              key={guideline.key}
            >
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-8 top-0 h-px opacity-60',
                  guideline.lineClassName
                )}
              />
              <guideline.icon
                className={cn(
                  'h-5 w-5 transition-transform duration-500 group-hover:scale-110',
                  guideline.tintClassName
                )}
              />
              <h3 className="mt-5 font-display font-semibold text-xl tracking-[-0.02em]">
                {t(`guidelines.${guideline.key}.title` as never)}
              </h3>

              <ul className="mt-5 divide-y divide-foreground/[0.07] border-foreground/[0.07] border-t">
                {[1, 2, 3, 4].map((rule) => (
                  <li
                    className="grid grid-cols-[1.75rem_1fr] gap-2 py-3 text-foreground/55 text-sm leading-relaxed"
                    key={rule}
                  >
                    <span className="font-mono-ui text-[0.62rem] text-foreground/30 tabular-nums">
                      0{rule}
                    </span>
                    <span>
                      {t(`guidelines.${guideline.key}.rule${rule}` as never)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </BrandSection>

      {/* ── Media kit ────────────────────────────────────────────────────── */}
      <section className="relative px-4 pb-24 sm:px-6 lg:px-8" id="media-kit">
        <div className="relative mx-auto grid w-full max-w-7xl items-end gap-10 overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.045] to-transparent p-8 sm:p-12 md:grid-cols-[1fr_auto]">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-24 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-blue/50 to-transparent"
          />

          <div>
            <FileText className="h-7 w-7 text-foreground/35" />
            <h2 className="mt-7 max-w-2xl text-balance font-display font-semibold text-4xl tracking-[-0.03em] sm:text-5xl">
              {t('cta.title')}
            </h2>
            <p className="mt-5 max-w-2xl text-balance text-foreground/55 text-lg leading-relaxed">
              {t('cta.description')}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <ActionLink href="/contact">
              <Download className="h-4 w-4" />
              {t('cta.primaryAction')}
            </ActionLink>
            <ActionLink href="/about" variant="ghost">
              {t('cta.secondaryAction')}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ActionLink>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * One section rhythm for the whole page.
 *
 * Replaces the alternating background colours and the per-section
 * `min-h-[calc(100dvh-5rem)]`: sections are separated by a hairline rule and
 * consistent padding, and take exactly the height their content needs.
 */
function BrandSection({
  children,
  id,
}: {
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section
      className="relative scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
      id={id}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_12%,transparent)_25%,color-mix(in_oklab,var(--foreground)_12%,transparent)_75%,transparent)]"
      />
      <div className="relative mx-auto w-full max-w-7xl">{children}</div>
    </section>
  );
}
