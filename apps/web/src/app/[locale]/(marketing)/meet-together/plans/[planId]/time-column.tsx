import { useLocale } from 'next-intl';

export default function TimeColumn({
  id,
  start,
  end,
  className,
}: {
  id: string;
  start: number;
  end: number;
  className?: string;
}) {
  const locale = useLocale();

  return (
    <div className={className}>
      <div className="p-1 text-transparent">
        <div className="text-xs">0</div>
        <div className="text-lg">0</div>
      </div>

      <div className="border border-b-0 border-transparent">
        {(() => {
          // Handle time ranges that cross midnight
          let timeSlots = [];
          const crossesMidnight = end < start;

          if (!crossesMidnight) {
            // Normal case: same day
            timeSlots = Array.from(
              Array(Math.floor(end + 1 - start)).keys()
            ).map((i) => (i + start) * 4);
          } else {
            // Crosses midnight: create two separate parts with a separator
            // Part 1: from start to 23 (end of day)
            const part1 = Array.from(Array(24 - start))
              .keys()
              .map((i) => (i + start) * 4);
            // Part 2: from 0 to end (beginning of next day)
            const part2 = Array.from(Array(end + 1))
              .keys()
              .map((i) => i * 4);
            timeSlots = [...part1, 'separator', ...part2];
          }

          return timeSlots.flatMap((slot, slotIndex) => {
            if (slot === 'separator') {
              // Render separator
              return (
                <div
                  key={`${id}-separator`}
                  className="relative flex h-6 w-14 items-center justify-center border-l border-transparent bg-transparent"
                >
                  <div className="text-xs text-foreground/60">···</div>
                </div>
              );
            }

            const hr = slot as number;
            // duplicate each time slot 4 times for 15-minute intervals
            return Array(4)
              .fill(hr)
              .map((hrValue, i) => (
                <div
                  key={`${id}-${hrValue}-${slotIndex}-${i}`}
                  className={`relative h-3 w-14 ${
                    hrValue === 0
                      ? ''
                      : (hrValue + 1) % 4 === 0 || (hrValue + 1) % 2 === 0
                        ? 'border-b border-transparent'
                        : ''
                  }`}
                >
                  {i === 0 && (
                    <div className="absolute -top-2 right-0 text-xs">
                      <div className="flex-none text-xs">
                        {hrValue / 4 === 12
                          ? '12:00 PM'
                          : hrValue / 4 === 24
                            ? '12:00 AM'
                            : hrValue / 4 < 12
                              ? `${hrValue / 4}:00 ${locale === 'vi' ? 'SA' : 'AM'}`
                              : `${hrValue / 4 - 12}:00 ${locale === 'vi' ? 'CH' : 'PM'}`}
                      </div>
                    </div>
                  )}
                </div>
              ));
          });
        })()}
      </div>
    </div>
  );
}
