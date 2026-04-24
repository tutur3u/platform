'use client';

import { Check, Sparkles } from '@tuturuuu/icons';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { isUsableNextImageSrc } from '@/lib/workspace-branding-image-url';

const warnedInvalidBrandImageSources = new Set<string>();

export type WorkspaceJoinBrand = {
  name: string | null | undefined;
  logo_url?: string | null;
  avatar_url?: string | null;
};

export function WorkspaceJoinBlurBackdrop({
  density = 'full',
}: {
  density?: 'full' | 'compact';
}) {
  if (density === 'compact') {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 right-1/4 h-64 w-64 animate-pulse rounded-full bg-dynamic-blue/5 blur-3xl" />
        <div
          className="absolute bottom-1/4 left-1/4 h-64 w-64 animate-pulse rounded-full bg-dynamic-purple/5 blur-3xl"
          style={{ animationDelay: '2s' }}
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute top-1/4 right-1/4 h-96 w-96 animate-pulse rounded-full bg-dynamic-blue/5 blur-3xl" />
      <div
        className="absolute bottom-1/4 left-1/4 h-96 w-96 animate-pulse rounded-full bg-dynamic-purple/5 blur-3xl"
        style={{ animationDelay: '2s' }}
      />
      <div
        className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-dynamic-pink/5 blur-3xl"
        style={{ animationDelay: '4s' }}
      />
    </div>
  );
}

export function WorkspaceJoinExperienceRoot({
  embedded,
  children,
}: {
  /** When true, fills a dashboard shell instead of min-h-screen marketing layout */
  embedded?: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const outerClass = embedded
    ? 'relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden p-4'
    : 'relative flex min-h-screen items-center justify-center overflow-hidden p-4';

  return (
    <div className={outerClass}>
      <WorkspaceJoinBlurBackdrop density={embedded ? 'compact' : 'full'} />
      <div
        className={`relative w-full max-w-md space-y-6 transition-all duration-700 ${
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

type CardHover = 'blue' | 'green';

export function WorkspaceJoinCardSurface({
  children,
  hoverShadow = 'blue',
  className = '',
}: {
  children: ReactNode;
  hoverShadow?: CardHover;
  className?: string;
}) {
  const hover =
    hoverShadow === 'green'
      ? 'hover:border-foreground/20 hover:shadow-dynamic-green/10'
      : 'hover:border-foreground/20 hover:shadow-dynamic-blue/10';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-foreground/10 bg-background/80 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 ${hover} ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-transparent via-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      {children}
    </div>
  );
}

export function WorkspaceJoinSparkles() {
  return (
    <div className="absolute top-4 right-4">
      <Sparkles className="h-5 w-5 animate-pulse text-dynamic-blue/40" />
    </div>
  );
}

export function WorkspaceJoinLogoBlock({
  workspace,
  size = 'lg',
  joined,
  ringAccent = 'blue',
}: {
  workspace: WorkspaceJoinBrand;
  size?: 'lg' | 'md';
  /** Success check overlay (invite link flow) */
  joined?: boolean;
  /** `green` matches the already-member marketing screen */
  ringAccent?: 'blue' | 'green';
}) {
  const wh = size === 'lg' ? 96 : 72;
  const textClass = size === 'lg' ? 'text-4xl' : 'text-3xl';
  const initial = (workspace.name?.trim()?.charAt(0) || 'W').toUpperCase();
  const ringClass =
    ringAccent === 'green'
      ? 'ring-dynamic-green/20'
      : 'ring-dynamic-blue/20 group-hover:ring-dynamic-blue/30';

  const rawBrandImage = workspace.logo_url || workspace.avatar_url;

  if (
    process.env.NODE_ENV !== 'production' &&
    rawBrandImage &&
    !isUsableNextImageSrc(rawBrandImage) &&
    !warnedInvalidBrandImageSources.has(rawBrandImage)
  ) {
    warnedInvalidBrandImageSources.add(rawBrandImage);
    console.warn(
      '[workspace-join-experience] Invalid workspace brand image source. Resolve branding URLs first via resolveWorkspaceBrandingUrlsForNext.',
      {
        rawBrandImage,
        workspaceId: (workspace as { id?: string }).id,
      }
    );
  }

  const brandImageSrc =
    rawBrandImage && isUsableNextImageSrc(rawBrandImage) ? rawBrandImage : null;

  return (
    <div className="mb-8 flex justify-center">
      <div className="relative">
        {brandImageSrc ? (
          <div
            className={`relative overflow-hidden rounded-2xl ring-4 ring-offset-4 ring-offset-background transition-all duration-300 group-hover:scale-110 ${ringClass}`}
          >
            <Image
              src={brandImageSrc}
              alt={workspace.name ?? 'Workspace'}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
              width={wh}
              height={wh}
              unoptimized
            />
          </div>
        ) : (
          <div
            className={`flex items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-blue via-dynamic-purple to-dynamic-pink shadow-lg ring-4 ring-offset-4 ring-offset-background transition-all duration-300 group-hover:scale-110 ${ringClass}`}
            style={{ width: wh, height: wh }}
          >
            <span
              className={`font-bold ${textClass} text-white drop-shadow-lg`}
            >
              {initial}
            </span>
          </div>
        )}
        {joined && (
          <div className="absolute -top-2 -right-2 animate-bounce rounded-full bg-dynamic-green p-2 shadow-lg ring-4 ring-background">
            <Check className="h-5 w-5 text-white" strokeWidth={3} />
          </div>
        )}
      </div>
    </div>
  );
}
