import tokens from '@tuturuuu/ui/sorbet-tokens.json';

const { color, hues, radius } = tokens;

/** Sorbet light tokens, the shared Tuturuuu design system. */
export const OG_THEME = {
  ground: color.light.ground,
  surface: color.light.surface,
  border: color.light.border,
  foreground: color.light.foreground,
  muted: color.light['muted-foreground'],
  primary: color.light.primary,
  primaryForeground: color.light['primary-foreground'],
  accent: color.light.accent,
  eyebrowFill: hues.blue.light.calm,
  eyebrowInk: hues.blue.light.ink,
  orbs: [hues.pink.light.calm, hues.orange.light.calm, hues.purple.light.calm],
  cardRadius: radius.xl,
  pill: radius.full,
} as const;

/** The Tuturuuu mark colours (brand identity, not UI tokens). */
export const OG_MARK = {
  red: '#E94646',
  orange: '#FB7B05',
  green: '#4ACA3F',
  blue: '#4180E9',
} as const;
