/** The icon tile colors, one Sorbet hue per activity, from the shared tokens. */
const TONES: Record<string, string> = {
  'tool:polls': 'bg-dynamic-blue/15 text-dynamic-blue',
  'tool:timers': 'bg-dynamic-orange/15 text-dynamic-orange',
  'tool:quiz': 'bg-dynamic-yellow/15 text-dynamic-yellow',
  'tool:live-qa': 'bg-dynamic-purple/15 text-dynamic-purple',
  'tool:live-assessment': 'bg-dynamic-green/15 text-dynamic-green',
  'tool:live-flashcards': 'bg-dynamic-pink/15 text-dynamic-pink',
  'tool:live-game': 'bg-dynamic-red/15 text-dynamic-red',
  'tool:live-icebreaker': 'bg-dynamic-cyan/15 text-dynamic-cyan',
  'tool:pen-whiteboard': 'bg-dynamic-indigo/15 text-dynamic-indigo',
  whiteboard: 'bg-dynamic-indigo/15 text-dynamic-indigo',
  breakouts: 'bg-dynamic-teal/15 text-dynamic-teal',
  programming: 'bg-dynamic-gray/15 text-dynamic-gray',
  document: 'bg-dynamic-blue/15 text-dynamic-blue',
  board: 'bg-dynamic-indigo/15 text-dynamic-indigo',
};

const NEUTRAL = 'bg-muted text-muted-foreground';

export const activityTone = (activityId: string) =>
  TONES[activityId] ?? NEUTRAL;
