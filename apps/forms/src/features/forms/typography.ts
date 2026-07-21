import type { FormThemeInput } from './schema';

type TextSize = FormThemeInput['typography']['displaySize'];

const DISPLAY_CLASSNAMES: Record<TextSize, string> = {
  sm: 'text-2xl sm:text-3xl',
  md: 'text-3xl sm:text-4xl',
  lg: 'text-4xl sm:text-5xl',
};

const HEADING_CLASSNAMES: Record<TextSize, string> = {
  sm: 'text-xl sm:text-2xl',
  md: 'text-2xl sm:text-3xl',
  lg: 'text-3xl sm:text-4xl',
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

/** Compact title scale for studio surfaces (sidebar, section/question editors). */
const STUDIO_TITLE_CLASSNAMES: Record<TextSize, string> = {
  sm: 'text-sm font-semibold',
  md: 'text-base font-semibold',
  lg: 'text-base font-semibold',
};

export function getStudioTitleTypographyClassName(size: TextSize) {
  return STUDIO_TITLE_CLASSNAMES[size];
}

export function getBodyTypographyClassName(size: TextSize) {
  return BODY_CLASSNAMES[size];
}
