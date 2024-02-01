import useTranslation from 'next-translate/useTranslation';

export default function TimeColumn({
  start,
  end,
}: {
  start: number;
  end: number;
}) {
  const { lang } = useTranslation();

  return (
    <div>
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
              key={hr}
              className={`relative h-2 w-16 ${
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
                          ? `${hr / 4}:00 ${lang === 'vi' ? 'SA' : 'AM'}`
                          : `${hr / 4 - 12}:00 ${lang === 'vi' ? 'CH' : 'PM'}`}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
