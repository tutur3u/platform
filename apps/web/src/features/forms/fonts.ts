import {
  Barlow,
  Be_Vietnam_Pro,
  DM_Serif_Display,
  Fira_Sans,
  Fraunces,
  Inter,
  Lora,
  Manrope,
  Merriweather,
  Newsreader,
  Noto_Sans,
  Noto_Serif,
  Nunito_Sans,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Source_Sans_3,
  Source_Serif_4,
  Space_Grotesk,
  Spectral,
} from 'next/font/google';
import type { CSSProperties } from 'react';
import type { FormThemeInput } from './schema';

type FormFontId = FormThemeInput['headlineFontId'];

const barlow = Barlow({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-barlow',
  weight: ['400', '500', '600', '700'],
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-be-vietnam-pro',
  weight: ['400', '500', '600', '700'],
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-dm-serif-display',
  weight: ['400'],
});

const firaSans = Fira_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-fira-sans',
  weight: ['400', '500', '600', '700'],
});

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-fraunces',
});

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-inter',
  weight: ['400', '500', '600', '700'],
});

const lora = Lora({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-lora',
  weight: ['400', '500', '600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-manrope',
});

const merriweather = Merriweather({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-merriweather',
  weight: ['300', '400', '700'],
});

const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-newsreader',
});

const notoSans = Noto_Sans({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-noto-sans',
  weight: ['400', '500', '600', '700'],
});

const notoSerif = Noto_Serif({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-noto-serif',
  weight: ['400', '500', '600', '700'],
});

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-nunito-sans',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-playfair-display',
  weight: ['400', '500', '600', '700'],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-plus-jakarta-sans',
  weight: ['400', '500', '600', '700', '800'],
});

const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-source-sans-3',
});

const sourceSerif4 = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-source-serif-4',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-form-space-grotesk',
});

const spectral = Spectral({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-form-spectral',
  weight: ['400', '500', '600', '700'],
});

const FONT_STYLE_MAP: Record<FormFontId, CSSProperties> = {
  barlow: {
    fontFamily: 'var(--font-form-barlow)',
  },
  'be-vietnam-pro': {
    fontFamily: 'var(--font-form-be-vietnam-pro)',
  },
  'dm-serif-display': {
    fontFamily: 'var(--font-form-dm-serif-display)',
  },
  'fira-sans': {
    fontFamily: 'var(--font-form-fira-sans)',
  },
  fraunces: {
    fontFamily: 'var(--font-form-fraunces)',
  },
  inter: {
    fontFamily: 'var(--font-form-inter)',
  },
  lora: {
    fontFamily: 'var(--font-form-lora)',
  },
  manrope: {
    fontFamily: 'var(--font-form-manrope)',
  },
  merriweather: {
    fontFamily: 'var(--font-form-merriweather)',
  },
  newsreader: {
    fontFamily: 'var(--font-form-newsreader)',
  },
  'noto-sans': {
    fontFamily: 'var(--font-form-noto-sans)',
  },
  'noto-serif': {
    fontFamily: 'var(--font-form-noto-serif)',
  },
  'nunito-sans': {
    fontFamily: 'var(--font-form-nunito-sans)',
  },
  'playfair-display': {
    fontFamily: 'var(--font-form-playfair-display)',
  },
  'plus-jakarta-sans': {
    fontFamily: 'var(--font-form-plus-jakarta-sans)',
  },
  'source-sans-3': {
    fontFamily: 'var(--font-form-source-sans-3)',
  },
  'source-serif-4': {
    fontFamily: 'var(--font-form-source-serif-4)',
  },
  'space-grotesk': {
    fontFamily: 'var(--font-form-space-grotesk)',
  },
  spectral: {
    fontFamily: 'var(--font-form-spectral)',
  },
};

export const FORM_FONT_VARIABLES = [
  barlow.variable,
  beVietnamPro.variable,
  dmSerifDisplay.variable,
  firaSans.variable,
  fraunces.variable,
  inter.variable,
  lora.variable,
  manrope.variable,
  merriweather.variable,
  newsreader.variable,
  notoSans.variable,
  notoSerif.variable,
  nunitoSans.variable,
  playfairDisplay.variable,
  plusJakartaSans.variable,
  sourceSans3.variable,
  sourceSerif4.variable,
  spaceGrotesk.variable,
  spectral.variable,
].join(' ');

export const FORM_FONT_OPTIONS: Array<{
  id: FormFontId;
  label: string;
  sample: string;
  tone: string;
}> = [
  {
    id: 'be-vietnam-pro',
    label: 'Be Vietnam Pro',
    sample: 'Warm clarity for fast-moving teams',
    tone: 'Direct',
  },
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    sample: 'Contemporary density with softer edges',
    tone: 'Modern',
  },
  {
    id: 'inter',
    label: 'Inter',
    sample: 'Crisp detail for analytical forms',
    tone: 'Neutral',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    sample: 'Wide, open spacing with a premium calm',
    tone: 'Airy',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    sample: 'Tech-forward geometry with sharper rhythm',
    tone: 'Bold',
  },
  {
    id: 'source-sans-3',
    label: 'Source Sans 3',
    sample: 'Stable utility for long operational forms',
    tone: 'Reliable',
  },
  {
    id: 'nunito-sans',
    label: 'Nunito Sans',
    sample: 'Rounded friendliness without losing clarity',
    tone: 'Friendly',
  },
  {
    id: 'fira-sans',
    label: 'Fira Sans',
    sample: 'Technical precision with compact energy',
    tone: 'Systemic',
  },
  {
    id: 'barlow',
    label: 'Barlow',
    sample: 'Tall, editorial sans for sharp dashboards',
    tone: 'Industrial',
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    sample: 'Clear multilingual body copy',
    tone: 'Utility',
  },
  {
    id: 'noto-serif',
    label: 'Noto Serif',
    sample: 'Formal headings with calm gravity',
    tone: 'Measured',
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    sample: 'Readable serif tension with modern proportions',
    tone: 'Scholarly',
  },
  {
    id: 'newsreader',
    label: 'Newsreader',
    sample: 'Magazine-like softness for reflective surveys',
    tone: 'Editorial',
  },
  {
    id: 'spectral',
    label: 'Spectral',
    sample: 'Thoughtful serif for richer stories',
    tone: 'Narrative',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    sample: 'Structured confidence for long reads',
    tone: 'Classic',
  },
  {
    id: 'lora',
    label: 'Lora',
    sample: 'Editorial warmth with softer rhythm',
    tone: 'Literary',
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    sample: 'High-contrast headlines with flair',
    tone: 'Dramatic',
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    sample: 'Expressive serif with a tactile curve',
    tone: 'Expressive',
  },
  {
    id: 'dm-serif-display',
    label: 'DM Serif Display',
    sample: 'Display serif with confident, compact drama',
    tone: 'Statement',
  },
];

export function getFormFontStyle(fontId: FormFontId): CSSProperties {
  return FONT_STYLE_MAP[fontId] ?? FONT_STYLE_MAP['be-vietnam-pro'];
}

export function getFormFontLabel(fontId: FormFontId) {
  return (
    FORM_FONT_OPTIONS.find((font) => font.id === fontId)?.label ??
    FORM_FONT_OPTIONS[0]!.label
  );
}
