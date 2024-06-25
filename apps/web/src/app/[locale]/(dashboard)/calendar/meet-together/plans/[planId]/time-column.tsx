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
        {Array.from(Array(Math.floor(end + 1 - start)).keys())
          .map((i) => (i + start) * 4)
          // duplicate each item 4 times
          .flatMap((i) => [i, i, i, i])
          .map((hr, i) => (
            <div
              key={`${id}-${hr}-${i}`}
              className={`relative h-3 w-14 ${
                hr === 0
                  ? ''
                  : (hr + 1) % 4 === 0 || (hr + 1) % 2 === 0
                    ? 'border-b border-transparent'
                    : ''
              }`}
            >
              {i % 4 === 0 && (
                <div className="absolute -top-2 right-0 text-xs">
                  <div className="flex-none text-xs">
                    {hr / 4 === 12
                      ? '12:00 PM'
                      : hr / 4 === 24
                        ? '12:00 AM'
                        : hr / 4 < 12
                          ? `${hr / 4}:00 ${locale === 'vi' ? 'SA' : 'AM'}`
                          : `${hr / 4 - 12}:00 ${locale === 'vi' ? 'CH' : 'PM'}`}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
