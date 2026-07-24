'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { brandColors, type productAssets } from './brand-data';

/**
 * The hero specimen plate, the entrance sweep and the asset ribbon.
 *
 * The stage used to be four blurred blobs behind concentric rings with the
 * mark floating in the middle — decoration on a page whose whole job is to
 * document how the mark is used. It is now a construction plate: the mark on a
 * measured field, inside its clear-space boundary, with registration ticks and
 * dimensions. Same role in the layout, but it now says something.
 */

const CLEAR_SPACE_RATIO = '1×';

export interface PlateReadings {
  clearSpace: string;
  clearSpaceValue: string;
  format: string;
  minWidth: string;
}

export function HeroBrandStage({
  readings,
  reduceMotion,
}: {
  readings: PlateReadings;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="relative hidden lg:block"
      initial={{ opacity: 0, x: 32 }}
      transition={{ delay: 0.15, duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.05] to-transparent">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent"
        />

        {/* Measured field */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(to right, color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage:
              'radial-gradient(ellipse 78% 78% at 50% 45%, black 15%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 78% 78% at 50% 45%, black 15%, transparent 80%)',
          }}
        />

        <div className="relative grid min-h-[26rem] place-items-center px-12 py-14">
          <div className="relative">
            {/* Clear-space boundary: the rule this plate exists to state. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-12 rounded-lg border border-foreground/20 border-dashed"
            />

            <RegistrationTicks />

            <motion.div
              animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
              className="relative grid h-40 w-40 place-items-center"
              transition={{
                duration: 7,
                ease: 'easeInOut',
                repeat: Number.POSITIVE_INFINITY,
              }}
            >
              {/* biome-ignore lint/performance/noImgElement: local branding SVG stays native to keep this dev route off next/image. */}
              <img
                alt=""
                className="h-full w-full object-contain drop-shadow-[0_24px_36px_rgba(0,0,0,0.18)]"
                height={160}
                loading="eager"
                src="/media/branding/tuturuuu.svg"
                width={160}
              />
            </motion.div>

            {/* Horizontal dimension across the clear-space box */}
            <span
              aria-hidden
              className="absolute -inset-x-12 -bottom-[4.25rem] flex items-center gap-2"
            >
              <span className="h-px flex-1 bg-foreground/20" />
              <span className="font-mono-ui text-[0.58rem] text-foreground/40 uppercase tracking-[0.16em]">
                {CLEAR_SPACE_RATIO}
              </span>
              <span className="h-px flex-1 bg-foreground/20" />
            </span>
          </div>
        </div>

        {/* Caption rail: the plate's readings */}
        <div className="relative grid grid-cols-3 divide-x divide-foreground/[0.07] border-foreground/[0.07] border-t">
          <PlateReading
            label={readings.clearSpace}
            value={readings.clearSpaceValue}
          />
          <PlateReading label={readings.minWidth} value="24 px" />
          <PlateReading label={readings.format} value="SVG" />
        </div>

        {/* Palette ribbon: the four brand colours, stated once, up front. */}
        <div aria-hidden className="relative grid grid-cols-4">
          {brandColors.map((item) => (
            <span
              className="h-1.5"
              key={item.color}
              style={{ backgroundColor: item.color }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function PlateReading({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4 text-center">
      <div className="font-mono-ui text-foreground/70 text-sm tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 font-mono-ui text-[0.55rem] text-foreground/35 uppercase tracking-[0.16em]">
        {label}
      </div>
    </div>
  );
}

/** The four L-brackets that frame a specimen on a spec sheet. */
function RegistrationTicks() {
  const corners = [
    '-top-12 -left-12 border-t border-l',
    '-top-12 -right-12 border-t border-r',
    '-bottom-12 -left-12 border-b border-l',
    '-right-12 -bottom-12 border-b border-r',
  ];

  return (
    <>
      {corners.map((corner) => (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute h-4 w-4 border-foreground/30',
            corner
          )}
          key={corner}
        />
      ))}
    </>
  );
}

/**
 * Entrance sweep.
 *
 * This was a `fixed inset-0 z-50` curtain over the whole viewport for ~1.6s on
 * every single visit — a splash screen in front of a page people come to in
 * order to grab a logo file. The four-colour signature is worth keeping, so it
 * still plays, but scoped to the hero panel: it never covers the navbar, never
 * blocks the page, and leaves nothing behind in the layer stack.
 */
export function BrandIntroSweep({
  reduceMotion,
}: {
  reduceMotion: boolean | null;
}) {
  if (reduceMotion) return null;

  return (
    <motion.div
      animate={{ opacity: [1, 1, 0] }}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      initial={{ opacity: 1 }}
      transition={{ delay: 0.85, duration: 0.35 }}
    >
      <div className="absolute inset-0 grid grid-rows-4">
        {brandColors.map((item, index) => (
          <motion.div
            animate={{ x: index % 2 === 0 ? '102%' : '-102%' }}
            initial={{ x: '0%' }}
            key={item.color}
            style={{ backgroundColor: item.color }}
            transition={{
              delay: index * 0.06,
              duration: 0.9,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

export function KineticAssetStrip({
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
      className="relative left-1/2 mt-14 w-screen -translate-x-1/2 overflow-hidden border-foreground/[0.07] border-y py-3"
    >
      {/* Fade the ribbon into the page at both ends so it reads as continuous
          rather than starting and stopping at the viewport edge. */}
      <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />

      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        className="flex w-max gap-2"
        transition={{
          duration: 28,
          ease: 'linear',
          repeat: Number.POSITIVE_INFINITY,
        }}
      >
        {loopItems.map((asset, index) => (
          <div
            className="flex h-16 w-52 shrink-0 items-center gap-3 rounded-xl border border-foreground/[0.07] bg-foreground/[0.015] px-5"
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
              <p className="truncate font-medium text-sm">
                {getName(asset.key)}
              </p>
              <div
                className="mt-2 h-0.5 w-14 rounded-full"
                style={{
                  backgroundColor:
                    brandColors[index % brandColors.length]?.color ??
                    brandColors[0].color,
                }}
              />
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
