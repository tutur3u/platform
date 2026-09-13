import type { CSSProperties } from 'react';
import { brandColors } from '@/app/[locale]/(marketing)/branding/brand-data';

export const pitchBrandColors = brandColors.map(({ color }) => color);
export const pitchBrandStyle = Object.fromEntries(
  brandColors.map(({ token, color }) => [`--pitch-${token}`, color])
) as CSSProperties;
export const pitchTone = (index: number) =>
  ({
    '--tone': `var(--pitch-${brandColors[index % brandColors.length]!.token})`,
  }) as CSSProperties;
