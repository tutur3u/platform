import { cn } from '@tuturuuu/utils/format';
import { LoadingRegion, Skeleton, SkeletonAvatar } from '../skeleton';

const BUBBLES = [
  { own: false, width: 'w-2/3' },
  { own: false, width: 'w-1/2' },
  { own: true, width: 'w-3/5' },
  { own: false, width: 'w-3/4' },
  { own: true, width: 'w-2/5' },
] as const;

/** Conversation placeholder: alternating incoming and outgoing bubbles. */
export function MessageListSkeleton({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion
      srLabel={srLabel}
      className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden p-4"
    >
      {BUBBLES.map((bubble, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          aria-hidden="true"
          className={cn(
            'flex items-end gap-2',
            bubble.own && 'flex-row-reverse'
          )}
        >
          {bubble.own ? null : <SkeletonAvatar size="md" />}
          <Skeleton className={cn('h-10 rounded-2xl', bubble.width)} />
        </div>
      ))}
    </LoadingRegion>
  );
}
