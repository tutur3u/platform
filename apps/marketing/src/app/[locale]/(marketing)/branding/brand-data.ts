import { Moon, Palette, Sparkles, Sun, Type } from '@tuturuuu/icons/lucide';

/**
 * Brand tokens, asset manifests and guideline copy keys.
 *
 * Extracted from the page component so the roster of colours and downloadable
 * assets is data rather than markup, and so no file on this route crosses the
 * repo's size ceiling.
 */

export const brandColors = [
  { token: 'innovation', color: '#4180E9' },
  { token: 'growth', color: '#4ACA3F' },
  { token: 'energy', color: '#FB7B05' },
  { token: 'impact', color: '#E94646' },
] as const;

export const systemColors = [
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

export type PreviewMode = 'dark' | 'light' | 'monoDark' | 'monoLight';

/** Translated strings a preview needs: one label per mode, plus chrome. */
export type PreviewLabels = Record<PreviewMode, string> & {
  description: string;
  fullscreen: string;
  title: string;
};

export const previewModes = [
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

export const primaryAssets = [
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

export const productAssets = [
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

export const summaryKeys = ['assets', 'colors', 'rules'] as const;

export const guidelineCards = [
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
