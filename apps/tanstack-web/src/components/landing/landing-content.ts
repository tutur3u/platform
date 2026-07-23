import type { Locale } from '../../lib/platform/locale';
import { englishLandingContent } from './landing-content-en';
import { vietnameseLandingContent } from './landing-content-vi';

export type FeatureKey =
  | 'tuplan'
  | 'tudo'
  | 'tumeet'
  | 'tuchat'
  | 'tufinance'
  | 'nova';

export type LandingContent = {
  meta: {
    title: string;
    description: string;
  };
  hero: {
    title: {
      line1: string;
      line2: string;
    };
    description: string;
    primaryCta: string;
    video: {
      badge: string;
      thumbnail: string;
      title: string;
      watchNow: string;
    };
    trust: string[];
    previewCards: Array<{
      label: string;
      items: string[];
    }>;
  };
  problem: {
    title: string;
    subtitle: string;
    stats: Array<{
      label: string;
      value: string;
    }>;
  };
  features: {
    title: string;
    subtitle: string;
    apps: Record<
      FeatureKey,
      {
        title: string;
        subtitle: string;
        description: string;
        highlights: string[];
      }
    >;
  };
  demo: {
    badge: string;
    title: {
      part1: string;
      highlight: string;
    };
    subtitle: string;
    panels: Array<{
      title: string;
      subtitle: string;
      cta: string;
      details: string[];
    }>;
  };
  ai: {
    title: string;
    subtitle: string;
    mira: {
      title: string;
      description: string;
      capabilities: string[];
      prompts: string[];
    };
  };
  pricing: {
    title: string;
    subtitle: string;
    tiers: Array<{
      badge?: string;
      cta: string;
      description: string;
      features: string[];
      name: string;
      period?: string;
      price: string;
    }>;
  };
  socialProof: {
    title: string;
    backedBy: string;
    cta: string;
    stats: Array<{
      label: string;
      value: string;
    }>;
  };
  cta: {
    title: string;
    description: string;
    primary: string;
    secondary: string;
    note: string;
    trust: string[];
  };
};

export const landingFeatureOrder: FeatureKey[] = [
  'tuplan',
  'tudo',
  'tumeet',
  'tuchat',
  'tufinance',
  'nova',
];

const landingContent: Record<Locale, LandingContent> = {
  en: englishLandingContent,
  vi: vietnameseLandingContent,
};

export function getLandingContent(locale: Locale) {
  return landingContent[locale];
}
