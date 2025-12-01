import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef } from 'react';

const lineCount = 3;

export type AudioPulseProps = {
  active: boolean;
  volume: number;
  hover?: boolean;
};

export default function AudioPulse({ active, volume, hover }: AudioPulseProps) {
  const lines = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    let timeout: number | null = null;
    const update = () => {
      lines.current.forEach((line, i) => {
        line.style.height = `${Math.min(
          24,
          4 + volume * (i === 1 ? 400 : 60)
        )}px`;
      });
      timeout = window.setTimeout(update, 100);
    };

    update();

    return () => clearTimeout((timeout as number)!);
  }, [volume]);

  return (
    <div
      className={cn(
        'flex w-6 items-center justify-evenly transition-opacity duration-300',
        active ? 'opacity-100' : 'opacity-50'
      )}
    >
      {Array(lineCount)
        .fill(null)
        .map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              lines.current[i] = el!;
            }}
            className={cn(
              'min-h-1 w-1 rounded-full transition-all duration-100',
              active ? 'bg-neutral-200' : 'bg-neutral-600',
              hover && 'animate-bounce'
            )}
            style={{
              animationDelay: `${i * 133}ms`,
              height: '4px', // Initial height
            }}
          />
        ))}
    </div>
  );
}
