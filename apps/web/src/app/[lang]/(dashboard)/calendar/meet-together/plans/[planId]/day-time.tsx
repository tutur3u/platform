export default function DayTime({
  start,
  end,
}: {
  start: number;
  end: number;
}) {
  return (
    <div className="border-foreground/50 w-12 border border-b-0">
      {Array.from(Array(Math.floor(end + 1 - start)).keys())
        .map((i) => (i + start) * 4)
        // duplicate each item 4 times
        .flatMap((i) => [i, i, i, i])
        .map((_, i, array) => (
          <div
            key={i}
            className={`${
              i + 4 <= array.length - 1 ? 'bg-foreground/30' : ''
            } relative h-2 w-full ${
              i === 0 || i + 4 > array.length - 1
                ? ''
                : (i + 1) % 4 === 0
                  ? 'border-foreground/50 border-b'
                  : (i + 1) % 2 === 0
                    ? 'border-foreground/50 border-b border-dashed'
                    : ''
            }`}
          />
        ))}
    </div>
  );
}
