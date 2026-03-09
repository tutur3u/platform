import type { FormThemeInput } from './schema';

type TextSize = FormThemeInput['typography']['displaySize'];

const DISPLAY_CLASSNAMES: Record<TextSize, string> = {
  sm: 'text-3xl sm:text-4xl',
  md: 'text-4xl sm:text-5xl',
  lg: 'text-5xl sm:text-6xl',
};

const HEADING_CLASSNAMES: Record<TextSize, string> = {
  sm: 'text-2xl sm:text-3xl',
  md: 'text-3xl sm:text-4xl',
  lg: 'text-4xl sm:text-5xl',
};

const BODY_CLASSNAMES: Record<TextSize, string> = {
  sm: 'text-sm leading-6',
  md: 'text-base leading-7',
  lg: 'text-lg leading-8',
};

export function getDisplayTypographyClassName(size: TextSize) {
  return DISPLAY_CLASSNAMES[size];
}

export function getHeadingTypographyClassName(size: TextSize) {
  return HEADING_CLASSNAMES[size];
}

export function getBodyTypographyClassName(size: TextSize) {
  return BODY_CLASSNAMES[size];
}
