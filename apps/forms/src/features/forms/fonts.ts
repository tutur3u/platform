import type { CSSProperties } from 'react';
import type { FormThemeInput } from './schema';

type FormFontId = FormThemeInput['headlineFontId'];

const SANS_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SERIF_STACK = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

const FONT_STYLE_MAP: Record<FormFontId, CSSProperties> = {
  barlow: {
    fontFamily: `Barlow, ${SANS_STACK}`,
  },
  'be-vietnam-pro': {
    fontFamily: `"Be Vietnam Pro", ${SANS_STACK}`,
  },
  'dm-serif-display': {
    fontFamily: `"DM Serif Display", ${SERIF_STACK}`,
  },
  'fira-sans': {
    fontFamily: `"Fira Sans", ${SANS_STACK}`,
  },
  fraunces: {
    fontFamily: `Fraunces, ${SERIF_STACK}`,
  },
  inter: {
    fontFamily: `Inter, ${SANS_STACK}`,
  },
  lora: {
    fontFamily: `Lora, ${SERIF_STACK}`,
  },
  manrope: {
    fontFamily: `Manrope, ${SANS_STACK}`,
  },
  merriweather: {
    fontFamily: `Merriweather, ${SERIF_STACK}`,
  },
  newsreader: {
    fontFamily: `Newsreader, ${SERIF_STACK}`,
  },
  'noto-sans': {
    fontFamily: `"Noto Sans", ${SANS_STACK}`,
  },
  'noto-serif': {
    fontFamily: `"Noto Serif", ${SERIF_STACK}`,
  },
  'nunito-sans': {
    fontFamily: `"Nunito Sans", ${SANS_STACK}`,
  },
  'playfair-display': {
    fontFamily: `"Playfair Display", ${SERIF_STACK}`,
  },
  'plus-jakarta-sans': {
    fontFamily: `"Plus Jakarta Sans", ${SANS_STACK}`,
  },
  'source-sans-3': {
    fontFamily: `"Source Sans 3", ${SANS_STACK}`,
  },
  'source-serif-4': {
    fontFamily: `"Source Serif 4", ${SERIF_STACK}`,
  },
  'space-grotesk': {
    fontFamily: `"Space Grotesk", ${SANS_STACK}`,
  },
  spectral: {
    fontFamily: `Spectral, ${SERIF_STACK}`,
  },
};

export const FORM_FONT_VARIABLES = '';

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
