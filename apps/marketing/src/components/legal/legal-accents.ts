/**
 * Static accent classes for legal section cards.
 *
 * Two problems are fixed here at once. The section card used to assemble
 * `bg-dynamic-${color}/10` at render time, which Tailwind's scanner never
 * sees, so no legal section had an accent colour at all. And four of the
 * fourteen colours the section data asks for — amber, emerald, slate and
 * violet — are not `dynamic-*` tokens in the first place, so they would have
 * been dead even spelled out. Those four alias onto the nearest real token
 * rather than silently rendering nothing.
 */
export type LegalAccent =
  | 'amber'
  | 'blue'
  | 'cyan'
  | 'emerald'
  | 'green'
  | 'indigo'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'rose'
  | 'slate'
  | 'teal'
  | 'violet';

interface AccentStyles {
  /** Icon glyph colour. */
  text: string;
  /** Icon plate fill. */
  plate: string;
  /** Left spine of the card. */
  spine: string;
  /** Lit top edge. */
  rule: string;
  /** Hover bloom. */
  bloom: string;
}

const styles: Record<LegalAccent, AccentStyles> = {
  amber: {
    text: 'text-dynamic-yellow',
    plate: 'bg-dynamic-yellow/10 border-dynamic-yellow/20',
    spine: 'bg-dynamic-yellow/40',
    rule: 'via-dynamic-yellow/45',
    bloom: 'bg-dynamic-yellow/20',
  },
  blue: {
    text: 'text-dynamic-blue',
    plate: 'bg-dynamic-blue/10 border-dynamic-blue/20',
    spine: 'bg-dynamic-blue/40',
    rule: 'via-dynamic-blue/45',
    bloom: 'bg-dynamic-blue/20',
  },
  cyan: {
    text: 'text-dynamic-cyan',
    plate: 'bg-dynamic-cyan/10 border-dynamic-cyan/20',
    spine: 'bg-dynamic-cyan/40',
    rule: 'via-dynamic-cyan/45',
    bloom: 'bg-dynamic-cyan/20',
  },
  emerald: {
    text: 'text-dynamic-green',
    plate: 'bg-dynamic-green/10 border-dynamic-green/20',
    spine: 'bg-dynamic-green/40',
    rule: 'via-dynamic-green/45',
    bloom: 'bg-dynamic-green/20',
  },
  green: {
    text: 'text-dynamic-green',
    plate: 'bg-dynamic-green/10 border-dynamic-green/20',
    spine: 'bg-dynamic-green/40',
    rule: 'via-dynamic-green/45',
    bloom: 'bg-dynamic-green/20',
  },
  indigo: {
    text: 'text-dynamic-indigo',
    plate: 'bg-dynamic-indigo/10 border-dynamic-indigo/20',
    spine: 'bg-dynamic-indigo/40',
    rule: 'via-dynamic-indigo/45',
    bloom: 'bg-dynamic-indigo/20',
  },
  orange: {
    text: 'text-dynamic-orange',
    plate: 'bg-dynamic-orange/10 border-dynamic-orange/20',
    spine: 'bg-dynamic-orange/40',
    rule: 'via-dynamic-orange/45',
    bloom: 'bg-dynamic-orange/20',
  },
  pink: {
    text: 'text-dynamic-pink',
    plate: 'bg-dynamic-pink/10 border-dynamic-pink/20',
    spine: 'bg-dynamic-pink/40',
    rule: 'via-dynamic-pink/45',
    bloom: 'bg-dynamic-pink/20',
  },
  purple: {
    text: 'text-dynamic-purple',
    plate: 'bg-dynamic-purple/10 border-dynamic-purple/20',
    spine: 'bg-dynamic-purple/40',
    rule: 'via-dynamic-purple/45',
    bloom: 'bg-dynamic-purple/20',
  },
  red: {
    text: 'text-dynamic-red',
    plate: 'bg-dynamic-red/10 border-dynamic-red/20',
    spine: 'bg-dynamic-red/40',
    rule: 'via-dynamic-red/45',
    bloom: 'bg-dynamic-red/20',
  },
  rose: {
    text: 'text-dynamic-rose',
    plate: 'bg-dynamic-rose/10 border-dynamic-rose/20',
    spine: 'bg-dynamic-rose/40',
    rule: 'via-dynamic-rose/45',
    bloom: 'bg-dynamic-rose/20',
  },
  slate: {
    text: 'text-dynamic-gray',
    plate: 'bg-dynamic-gray/10 border-dynamic-gray/20',
    spine: 'bg-dynamic-gray/40',
    rule: 'via-dynamic-gray/45',
    bloom: 'bg-dynamic-gray/20',
  },
  teal: {
    text: 'text-dynamic-teal',
    plate: 'bg-dynamic-teal/10 border-dynamic-teal/20',
    spine: 'bg-dynamic-teal/40',
    rule: 'via-dynamic-teal/45',
    bloom: 'bg-dynamic-teal/20',
  },
  violet: {
    text: 'text-dynamic-purple',
    plate: 'bg-dynamic-purple/10 border-dynamic-purple/20',
    spine: 'bg-dynamic-purple/40',
    rule: 'via-dynamic-purple/45',
    bloom: 'bg-dynamic-purple/20',
  },
};

const fallback = styles.purple;

export function getLegalAccent(color: string): AccentStyles {
  return styles[color as LegalAccent] ?? fallback;
}
