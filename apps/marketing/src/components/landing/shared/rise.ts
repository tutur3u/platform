import { cn } from '@tuturuuu/utils/format';

/** Preserve the hero's layout without delaying text paint. */
export function rise(_step: number, className?: string) {
  return { className: cn(className) };
}
