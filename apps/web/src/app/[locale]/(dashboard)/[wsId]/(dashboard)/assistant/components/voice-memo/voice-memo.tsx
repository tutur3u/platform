import { cn } from '@tuturuuu/utils/format';
import { memo, useMemo } from 'react';

interface VoiceMemoProps {
  isActive?: boolean;
  speaker: 'user' | 'assistant';
  content: string;
}

function VoiceMemoComponent({
  isActive = false,
  speaker,
  content,
}: VoiceMemoProps) {
  // Generate random heights but keep them stable unless active changes
  const barHeights = useMemo(
    () => Array.from({ length: 32 }, () => Math.random() * 100),
    []
  );

  return (
    <div
      className={cn(
        'rounded-lg p-4 transition-all duration-200',
        speaker === 'user' ? 'bg-blue-950/50' : 'bg-emerald-950/50',
        !isActive && 'opacity-50'
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn(
            'h-2 w-2 animate-pulse rounded-full',
            speaker === 'user' ? 'bg-blue-400' : 'bg-emerald-400',
            isActive ? 'opacity-100' : 'opacity-0'
          )}
        />
        <h3
          className={cn(
            'font-medium text-sm',
            speaker === 'user' ? 'text-blue-300' : 'text-emerald-300'
          )}
        >
          {speaker === 'user' ? 'You' : 'Assistant'}
        </h3>
      </div>

      {/* Voice Waveform Visualization */}
      <div className="flex h-8 items-center gap-0.5">
        {barHeights.map((height, i) => (
          <div
            key={i}
            className={cn(
              'w-1 rounded-full transition-all duration-150',
              speaker === 'user' ? 'bg-blue-400/20' : 'bg-emerald-400/20',
              isActive && 'animate-wave'
            )}
            style={{
              height: `${isActive ? height * Math.random() : height}%`,
              animationDelay: `${i * 30}ms`,
            }}
          />
        ))}
      </div>

      <p
        className={cn(
          'mt-2 text-sm',
          speaker === 'user' ? 'text-blue-100' : 'text-emerald-100'
        )}
      >
        {content}
      </p>
    </div>
  );
}

export const VoiceMemo = memo(VoiceMemoComponent);
