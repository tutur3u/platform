'use client';

import type { LucideIcon } from '@tuturuuu/icons';
import { ArrowRight, Check, Clock } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';

// Explicit color mappings for Tailwind to detect at build time
const colorStyles = {
  green: {
    cardHighlighted:
      'border-dynamic-light-green/40 bg-gradient-to-b from-calendar-bg-green via-calendar-bg-green/50 to-background shadow-lg',
    cardHover: 'hover:border-dynamic-light-green/30',
    badge:
      'border-dynamic-light-green/30 bg-calendar-bg-green text-dynamic-light-green',
    iconBg: 'bg-calendar-bg-green',
    iconText: 'text-dynamic-light-green',
    checkmark: 'text-dynamic-light-green',
    ctaButton: 'bg-dynamic-light-green hover:bg-dynamic-light-green/90',
  },
  blue: {
    cardHighlighted:
      'border-dynamic-light-blue/40 bg-gradient-to-b from-calendar-bg-blue via-calendar-bg-blue/50 to-background shadow-lg',
    cardHover: 'hover:border-dynamic-light-blue/30',
    badge:
      'border-dynamic-light-blue/30 bg-calendar-bg-blue text-dynamic-light-blue',
    iconBg: 'bg-calendar-bg-blue',
    iconText: 'text-dynamic-light-blue',
    checkmark: 'text-dynamic-light-blue',
    ctaButton: 'bg-dynamic-light-blue hover:bg-dynamic-light-blue/90',
  },
  purple: {
    cardHighlighted:
      'border-dynamic-light-purple/40 bg-gradient-to-b from-calendar-bg-purple via-calendar-bg-purple/50 to-background shadow-lg',
    cardHover: 'hover:border-dynamic-light-purple/30',
    badge:
      'border-dynamic-light-purple/30 bg-calendar-bg-purple text-dynamic-light-purple',
    iconBg: 'bg-calendar-bg-purple',
    iconText: 'text-dynamic-light-purple',
    checkmark: 'text-dynamic-light-purple',
    ctaButton: 'bg-dynamic-light-purple hover:bg-dynamic-light-purple/90',
  },
  orange: {
    cardHighlighted:
      'border-dynamic-light-orange/40 bg-gradient-to-b from-calendar-bg-orange via-calendar-bg-orange/50 to-background shadow-lg',
    cardHover: 'hover:border-dynamic-light-orange/30',
    badge:
      'border-dynamic-light-orange/30 bg-calendar-bg-orange text-dynamic-light-orange',
    iconBg: 'bg-calendar-bg-orange',
    iconText: 'text-dynamic-light-orange',
    checkmark: 'text-dynamic-light-orange',
    ctaButton: 'bg-dynamic-light-orange hover:bg-dynamic-light-orange/90',
  },
  cyan: {
    cardHighlighted:
      'border-dynamic-light-cyan/40 bg-gradient-to-b from-calendar-bg-cyan via-calendar-bg-cyan/50 to-background shadow-lg',
    cardHover: 'hover:border-dynamic-light-cyan/30',
    badge:
      'border-dynamic-light-cyan/30 bg-calendar-bg-cyan text-dynamic-light-cyan',
    iconBg: 'bg-calendar-bg-cyan',
    iconText: 'text-dynamic-light-cyan',
    checkmark: 'text-dynamic-light-cyan',
    ctaButton: 'bg-dynamic-light-cyan hover:bg-dynamic-light-cyan/90',
  },
  gray: {
    cardHighlighted:
      'border-dynamic-light-gray/40 bg-gradient-to-b from-calendar-bg-gray via-calendar-bg-gray/50 to-background shadow-lg',
    cardHover: 'hover:border-dynamic-light-gray/30',
    badge:
      'border-dynamic-light-gray/30 bg-calendar-bg-gray text-dynamic-light-gray',
    iconBg: 'bg-calendar-bg-gray',
    iconText: 'text-dynamic-light-gray',
    checkmark: 'text-dynamic-light-gray',
    ctaButton: 'bg-dynamic-light-gray hover:bg-dynamic-light-gray/90',
  },
} as const;

type ColorKey = keyof typeof colorStyles;

interface PricingCardProps {
  icon: LucideIcon;
  name: string;
  price: string;
  period?: string;
  badge?: string;
  description: string;
  cta: string;
  ctaVariant: 'default' | 'outline';
  features: string[];
  color: ColorKey;
  highlighted?: boolean;
  isEnterprise?: boolean;
  isFree?: boolean;
}

export function PricingCard({
  icon: Icon,
  name,
  price,
  period,
  badge,
  description,
  cta,
  ctaVariant,
  features,
  color,
  highlighted,
  isEnterprise,
  isFree,
}: PricingCardProps) {
  const styles = colorStyles[color] || colorStyles.blue;

  return (
    <div
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-xl border p-5 transition-all',
        highlighted
          ? styles.cardHighlighted
          : cn(
              'border-foreground/10 bg-background/50 hover:shadow-md',
              styles.cardHover
            )
      )}
    >
      {/* Badge */}
      {badge && (
        <Badge
          variant="secondary"
          className={cn(
            'absolute top-4 right-4 text-xs',
            highlighted
              ? styles.badge
              : 'border-foreground/20 bg-foreground/10 text-foreground/70'
          )}
        >
          {badge}
        </Badge>
      )}

      {/* Icon & Name */}
      <div
        className={cn(
          'mb-3 flex h-10 w-10 items-center justify-center rounded-lg',
          styles.iconBg
        )}
      >
        <Icon className={cn('h-5 w-5', styles.iconText)} />
      </div>

      <h3 className="mb-1 font-semibold text-lg">{name}</h3>

      {/* Price with animation */}
      <div className="mb-2 flex items-baseline">
        <div className="overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={price}
              className="block font-bold text-3xl"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 25,
              }}
            >
              {price}
            </motion.span>
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {period && (
            <motion.span
              key={period}
              className="ml-1 text-foreground/50 text-sm"
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 5 }}
              transition={{ duration: 0.2 }}
            >
              {period}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Description */}
      <p className="mb-4 text-foreground/60 text-sm">{description}</p>

      {/* Features */}
      <ul className="mb-6 flex-1 space-y-2">
        {features.map((feature, index) => {
          // Check for "Everything in X +" pattern
          const isInheritFeature =
            feature.includes('Everything in') ||
            feature.includes('Mọi thứ của');
          // Check for "coming soon" pattern
          const isComingSoon =
            feature.includes('coming soon') || feature.includes('sắp ra mắt');
          // Check for "beta" pattern
          const isBeta = feature.includes('(beta)');

          if (isInheritFeature) {
            return (
              <li
                key={index}
                className={cn(
                  '-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5',
                  styles.iconBg
                )}
              >
                <ArrowRight
                  className={cn('h-4 w-4 shrink-0', styles.iconText)}
                />
                <span className={cn('font-medium text-sm', styles.iconText)}>
                  {feature}
                </span>
              </li>
            );
          }

          if (isComingSoon) {
            return (
              <li key={index} className="flex items-start gap-2 opacity-60">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-foreground/50" />
                <span className="text-foreground/50 text-sm italic">
                  {feature}
                </span>
              </li>
            );
          }

          // Strip "(beta)" from display text if present
          const displayText = isBeta
            ? feature.replace(/\s*\(beta\)\s*/gi, '')
            : feature;

          return (
            <li key={index} className="flex items-start gap-2">
              <Check
                className={cn('mt-0.5 h-4 w-4 shrink-0', styles.checkmark)}
              />
              <span className="text-foreground/70 text-sm">
                {displayText}
                {isBeta && (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 border-dynamic-yellow/30 bg-dynamic-yellow/10 px-1 py-0 text-[10px] text-dynamic-yellow"
                  >
                    Beta
                  </Badge>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {/* CTA */}
      <Button
        variant={ctaVariant}
        className={cn(
          'w-full',
          highlighted && ctaVariant === 'default' && styles.ctaButton
        )}
        asChild
      >
        <Link
          href={
            isEnterprise
              ? '/contact'
              : isFree
                ? '/onboarding'
                : '/personal/billing'
          }
        >
          {cta}
        </Link>
      </Button>
    </div>
  );
}
