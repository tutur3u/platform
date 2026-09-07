const tones: Record<string, string> = {
  blue: 'bg-dynamic-blue/10 text-dynamic-blue',
  red: 'bg-dynamic-red/10 text-dynamic-red',
  green: 'bg-dynamic-green/10 text-dynamic-green',
  purple: 'bg-dynamic-purple/10 text-dynamic-purple',
  yellow: 'bg-dynamic-yellow/10 text-dynamic-yellow',
  orange: 'bg-dynamic-orange/10 text-dynamic-orange',
  pink: 'bg-dynamic-pink/10 text-dynamic-pink',
  cyan: 'bg-dynamic-cyan/10 text-dynamic-cyan',
  indigo: 'bg-dynamic-indigo/10 text-dynamic-indigo',
  gray: 'bg-muted text-muted-foreground',
};
export function calendarEventTone(color: string | null | undefined) {
  return tones[color?.toLowerCase() ?? ''] ?? 'bg-primary/10 text-primary';
}
