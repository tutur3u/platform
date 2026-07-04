import type { PartnerColor } from './partners-data';

export type FeaturedPartnerColorClasses = {
  arrow: string;
  badge: string;
  border: string;
  glow: string;
  gradient: string;
  ringGlow: string;
};

export type PartnerGridColorClasses = FeaturedPartnerColorClasses & {
  icon: string;
  overlay: string;
};

export const featuredPartnerColorClasses: Record<
  Extract<PartnerColor, 'orange' | 'purple' | 'red'>,
  FeaturedPartnerColorClasses
> = {
  purple: {
    arrow: 'text-dynamic-purple',
    badge:
      'border-dynamic-purple bg-dynamic-purple/10 text-dynamic-purple shadow-dynamic-purple/30',
    border: 'border-dynamic-purple/40 hover:border-dynamic-purple/70',
    glow: 'hover:shadow-dynamic-purple/30',
    gradient: 'from-dynamic-purple/20 via-dynamic-purple/5',
    ringGlow: 'text-dynamic-purple ring-dynamic-purple/50',
  },
  orange: {
    arrow: 'text-dynamic-orange',
    badge:
      'border-dynamic-orange bg-dynamic-orange/10 text-dynamic-orange shadow-dynamic-orange/30',
    border: 'border-dynamic-orange/40 hover:border-dynamic-orange/70',
    glow: 'hover:shadow-dynamic-orange/30',
    gradient: 'from-dynamic-orange/20 via-dynamic-orange/5',
    ringGlow: 'text-dynamic-orange ring-dynamic-orange/50',
  },
  red: {
    arrow: 'text-dynamic-red',
    badge:
      'border-dynamic-red bg-dynamic-red/10 text-dynamic-red shadow-dynamic-red/30',
    border: 'border-dynamic-red/40 hover:border-dynamic-red/70',
    glow: 'hover:shadow-dynamic-red/30',
    gradient: 'from-dynamic-red/20 via-dynamic-red/5',
    ringGlow: 'text-dynamic-red ring-dynamic-red/50',
  },
};

export const partnerGridColorClasses: Record<
  PartnerColor,
  PartnerGridColorClasses
> = {
  purple: {
    arrow: 'text-dynamic-purple',
    badge:
      'border-dynamic-purple bg-dynamic-purple/10 text-dynamic-purple shadow-dynamic-purple/20',
    border: 'border-dynamic-purple/40 hover:border-dynamic-purple/70',
    glow: 'hover:shadow-dynamic-purple/20',
    gradient: 'from-dynamic-purple/20 via-dynamic-purple/5',
    icon: 'text-dynamic-purple',
    overlay: 'group-hover:from-dynamic-purple/10',
    ringGlow: 'text-dynamic-purple ring-dynamic-purple/40',
  },
  orange: {
    arrow: 'text-dynamic-orange',
    badge:
      'border-dynamic-orange bg-dynamic-orange/10 text-dynamic-orange shadow-dynamic-orange/20',
    border: 'border-dynamic-orange/40 hover:border-dynamic-orange/70',
    glow: 'hover:shadow-dynamic-orange/20',
    gradient: 'from-dynamic-orange/20 via-dynamic-orange/5',
    icon: 'text-dynamic-orange',
    overlay: 'group-hover:from-dynamic-orange/10',
    ringGlow: 'text-dynamic-orange ring-dynamic-orange/40',
  },
  red: {
    arrow: 'text-dynamic-red',
    badge:
      'border-dynamic-red bg-dynamic-red/10 text-dynamic-red shadow-dynamic-red/20',
    border: 'border-dynamic-red/40 hover:border-dynamic-red/70',
    glow: 'hover:shadow-dynamic-red/20',
    gradient: 'from-dynamic-red/20 via-dynamic-red/5',
    icon: 'text-dynamic-red',
    overlay: 'group-hover:from-dynamic-red/10',
    ringGlow: 'text-dynamic-red ring-dynamic-red/40',
  },
  blue: {
    arrow: 'text-dynamic-blue',
    badge:
      'border-dynamic-blue bg-dynamic-blue/10 text-dynamic-blue shadow-dynamic-blue/20',
    border: 'border-dynamic-blue/40 hover:border-dynamic-blue/70',
    glow: 'hover:shadow-dynamic-blue/20',
    gradient: 'from-dynamic-blue/20 via-dynamic-blue/5',
    icon: 'text-dynamic-blue',
    overlay: 'group-hover:from-dynamic-blue/10',
    ringGlow: 'text-dynamic-blue ring-dynamic-blue/40',
  },
  green: {
    arrow: 'text-dynamic-green',
    badge:
      'border-dynamic-green bg-dynamic-green/10 text-dynamic-green shadow-dynamic-green/20',
    border: 'border-dynamic-green/40 hover:border-dynamic-green/70',
    glow: 'hover:shadow-dynamic-green/20',
    gradient: 'from-dynamic-green/20 via-dynamic-green/5',
    icon: 'text-dynamic-green',
    overlay: 'group-hover:from-dynamic-green/10',
    ringGlow: 'text-dynamic-green ring-dynamic-green/40',
  },
  cyan: {
    arrow: 'text-dynamic-cyan',
    badge:
      'border-dynamic-cyan bg-dynamic-cyan/10 text-dynamic-cyan shadow-dynamic-cyan/20',
    border: 'border-dynamic-cyan/40 hover:border-dynamic-cyan/70',
    glow: 'hover:shadow-dynamic-cyan/20',
    gradient: 'from-dynamic-cyan/20 via-dynamic-cyan/5',
    icon: 'text-dynamic-cyan',
    overlay: 'group-hover:from-dynamic-cyan/10',
    ringGlow: 'text-dynamic-cyan ring-dynamic-cyan/40',
  },
  pink: {
    arrow: 'text-dynamic-pink',
    badge:
      'border-dynamic-pink bg-dynamic-pink/10 text-dynamic-pink shadow-dynamic-pink/20',
    border: 'border-dynamic-pink/40 hover:border-dynamic-pink/70',
    glow: 'hover:shadow-dynamic-pink/20',
    gradient: 'from-dynamic-pink/20 via-dynamic-pink/5',
    icon: 'text-dynamic-pink',
    overlay: 'group-hover:from-dynamic-pink/10',
    ringGlow: 'text-dynamic-pink ring-dynamic-pink/40',
  },
};
