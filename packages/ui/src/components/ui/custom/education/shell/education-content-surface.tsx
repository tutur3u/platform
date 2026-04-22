import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface EducationContentSurfaceProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  pattern?: boolean;
}

export function EducationContentSurface({
  children,
  className,
  padded = true,
  pattern = false,
}: EducationContentSurfaceProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm',
        padded ? 'p-3 sm:p-4' : '',
        className
      )}
    >
      {pattern ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.04)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.04)_1px,transparent_1px)] bg-[size:24px_24px] opacity-25" />
      ) : null}
      <div className={cn(pattern ? 'relative' : undefined)}>{children}</div>
    </section>
  );
}
