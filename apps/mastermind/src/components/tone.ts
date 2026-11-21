import { cn } from '@tuturuuu/utils/format';
import type { ActivityTone } from '../fleet/model';

export type Tone = ActivityTone | 'yellow';

/**
 * Status tones use the shared dynamic-* state colours only; every badge also
 * carries text, so colour is never the only signal.
 */
const BADGE: Record<Tone, string> = {
  green: 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
  orange: 'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
  red: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
  blue: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
  yellow: 'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
  gray: 'border-dynamic-gray/20 bg-dynamic-gray/10 text-dynamic-gray',
};
const DOT: Record<Tone, string> = {
  green: 'bg-dynamic-green',
  orange: 'bg-dynamic-orange',
  red: 'bg-dynamic-red',
  blue: 'bg-dynamic-blue',
  yellow: 'bg-dynamic-yellow',
  gray: 'bg-dynamic-gray',
};

export function toneBadge(tone: Tone, className?: string) {
  return cn(BADGE[tone], className);
}

export function toneDot(tone: Tone, className?: string) {
  return cn('inline-block size-2 flex-none rounded-full', DOT[tone], className);
}
