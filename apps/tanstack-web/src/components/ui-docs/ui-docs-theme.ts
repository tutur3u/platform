import type { ShowcaseCategory } from './component-registry';

/**
 * Per-category accent styling for the UI docs.
 *
 * Tailwind cannot see dynamically interpolated class names, so every value here
 * is a complete, literal class string. Always reference colors through the
 * semantic `dynamic-*` token system (never hard-coded hues like `text-blue-500`).
 */
export interface DocsAccent {
  /** Accent text color (e.g. headings, icons). */
  text: string;
  /** Soft tinted surface background. */
  bg: string;
  /** Tinted border. */
  border: string;
  /** Solid dot / marker background. */
  dot: string;
  /** Tailwind gradient stops for clip-text titles and hero glows. */
  gradient: string;
  /** Focus / hover ring tint. */
  ring: string;
}

const ACCENTS: Record<ShowcaseCategory, DocsAccent> = {
  actions: {
    text: 'text-dynamic-blue',
    bg: 'bg-dynamic-blue/10',
    border: 'border-dynamic-blue/30',
    dot: 'bg-dynamic-blue',
    gradient: 'from-dynamic-blue to-dynamic-cyan',
    ring: 'ring-dynamic-blue/20',
  },
  inputs: {
    text: 'text-dynamic-green',
    bg: 'bg-dynamic-green/10',
    border: 'border-dynamic-green/30',
    dot: 'bg-dynamic-green',
    gradient: 'from-dynamic-green to-dynamic-lime',
    ring: 'ring-dynamic-green/20',
  },
  overlays: {
    text: 'text-dynamic-purple',
    bg: 'bg-dynamic-purple/10',
    border: 'border-dynamic-purple/30',
    dot: 'bg-dynamic-purple',
    gradient: 'from-dynamic-purple to-dynamic-pink',
    ring: 'ring-dynamic-purple/20',
  },
  navigation: {
    text: 'text-dynamic-cyan',
    bg: 'bg-dynamic-cyan/10',
    border: 'border-dynamic-cyan/30',
    dot: 'bg-dynamic-cyan',
    gradient: 'from-dynamic-cyan to-dynamic-sky',
    ring: 'ring-dynamic-cyan/20',
  },
  feedback: {
    text: 'text-dynamic-orange',
    bg: 'bg-dynamic-orange/10',
    border: 'border-dynamic-orange/30',
    dot: 'bg-dynamic-orange',
    gradient: 'from-dynamic-orange to-dynamic-amber',
    ring: 'ring-dynamic-orange/20',
  },
  data: {
    text: 'text-dynamic-indigo',
    bg: 'bg-dynamic-indigo/10',
    border: 'border-dynamic-indigo/30',
    dot: 'bg-dynamic-indigo',
    gradient: 'from-dynamic-indigo to-dynamic-blue',
    ring: 'ring-dynamic-indigo/20',
  },
  layout: {
    text: 'text-dynamic-pink',
    bg: 'bg-dynamic-pink/10',
    border: 'border-dynamic-pink/30',
    dot: 'bg-dynamic-pink',
    gradient: 'from-dynamic-pink to-dynamic-rose',
    ring: 'ring-dynamic-pink/20',
  },
  typography: {
    text: 'text-dynamic-sky',
    bg: 'bg-dynamic-sky/10',
    border: 'border-dynamic-sky/30',
    dot: 'bg-dynamic-sky',
    gradient: 'from-dynamic-sky to-dynamic-cyan',
    ring: 'ring-dynamic-sky/20',
  },
  advanced: {
    text: 'text-dynamic-red',
    bg: 'bg-dynamic-red/10',
    border: 'border-dynamic-red/30',
    dot: 'bg-dynamic-red',
    gradient: 'from-dynamic-red to-dynamic-orange',
    ring: 'ring-dynamic-red/20',
  },
};

/** Neutral brand accent for non-category surfaces (overview, setup, contributing). */
export const BRAND_ACCENT: DocsAccent = {
  text: 'text-dynamic-purple',
  bg: 'bg-dynamic-purple/10',
  border: 'border-dynamic-purple/30',
  dot: 'bg-dynamic-purple',
  gradient: 'from-dynamic-purple via-dynamic-blue to-dynamic-cyan',
  ring: 'ring-dynamic-purple/20',
};

export function getAccent(category?: ShowcaseCategory): DocsAccent {
  if (!category) return BRAND_ACCENT;
  return ACCENTS[category] ?? BRAND_ACCENT;
}

export type DocsAccentName = ShowcaseCategory;
