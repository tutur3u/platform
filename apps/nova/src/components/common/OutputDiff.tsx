import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';

interface OutputDiffProps {
  expected?: string;
  actual?: string;
  className?: string;
}

export default function OutputDiff({
  expected = '',
  actual = '',
  className,
}: OutputDiffProps) {
  const [diffLines, setDiffLines] = useState<
    { text: string; type: 'same' | 'added' | 'removed' }[]
  >([]);

  useEffect(() => {
    // Simple diff algorithm to highlight differences
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');
    const result: { text: string; type: 'same' | 'added' | 'removed' }[] = [];

    // Find the maximum length to iterate through both arrays
    const maxLength = Math.max(expectedLines.length, actualLines.length);

    for (let i = 0; i < maxLength; i++) {
      const expectedLine = i < expectedLines.length ? expectedLines[i] : null;
      const actualLine = i < actualLines.length ? actualLines[i] : null;

      if (expectedLine === actualLine) {
        // Lines are the same
        if (expectedLine !== null) {
          result.push({ text: expectedLine || '', type: 'same' });
        }
      } else {
        // Lines differ
        if (expectedLine !== null) {
          result.push({ text: expectedLine || '', type: 'removed' });
        }
        if (actualLine !== null) {
          result.push({ text: actualLine || '', type: 'added' });
        }
      }
    }

    setDiffLines(result);
  }, [expected, actual]);

  return (
    <div
      className={cn(
        'max-h-80 overflow-auto rounded-md border p-2 font-mono text-xs',
        className
      )}
    >
      {diffLines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'whitespace-pre-wrap px-1',
            line.type === 'added'
              ? 'border-l-2 border-green-500 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : line.type === 'removed'
                ? 'border-l-2 border-red-500 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                : ''
          )}
        >
          <span className="mr-2">
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          {line.text}
        </div>
      ))}
    </div>
  );
}
