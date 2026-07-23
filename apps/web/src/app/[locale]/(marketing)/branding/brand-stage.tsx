'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { brandColors, type productAssets } from './brand-data';

/** The animated hero stage, its intro wash, and the kinetic asset ribbon. */

export function HeroBrandStage({
  reduceMotion,
}: {
  reduceMotion: boolean | null;
}) {
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

export function BrandIntroTransition({
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
