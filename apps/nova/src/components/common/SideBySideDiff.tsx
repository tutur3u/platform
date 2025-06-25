import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';

interface SideBySideDiffProps {
  left?: string;
  right?: string;
  leftTitle?: string;
  rightTitle?: string;
  className?: string;
  showLineNumbers?: boolean;
}

interface DiffLine {
  content: string;
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  // For modified lines, we need to track character-level differences
  inlineDiff?: {
    segments: {
      text: string;
      highlight: boolean;
    }[];
  };
}

export default function SideBySideDiff({
  left = '',
  right = '',
  leftTitle = 'Expected',
  rightTitle = 'Actual',
  className,
  showLineNumbers = false,
}: SideBySideDiffProps) {
  const [diffData, setDiffData] = useState<{
    leftLines: DiffLine[];
    rightLines: DiffLine[];
  }>({
    leftLines: [],
    rightLines: [],
  });

  useEffect(() => {
    // Split the content into lines
    const leftContent = left.split('\n');
    const rightContent = right.split('\n');

    // Create a mapping of lines for comparison
    const leftLines: DiffLine[] = [];
    const rightLines: DiffLine[] = [];

    // Find the maximum length to iterate through both arrays
    const maxLines = Math.max(leftContent.length, rightContent.length);

    for (let i = 0; i < maxLines; i++) {
      const leftLine = i < leftContent.length ? leftContent[i] : null;
      const rightLine = i < rightContent.length ? rightContent[i] : null;

      // Determine line types based on comparison
      if (leftLine === rightLine) {
        // Lines are identical
        if (leftLine !== null) {
          leftLines.push({
            content: leftLine || '',
            type: 'unchanged',
          });
        }

        if (rightLine !== null) {
          rightLines.push({
            content: rightLine || '',
            type: 'unchanged',
          });
        }
      } else {
        // Lines differ - calculate inline character differences for modified lines
        if (leftLine !== null && rightLine !== null) {
          // Both lines exist, but are different - they are modified
          const leftInlineDiff = findInlineDiff(leftLine, rightLine);
          const rightInlineDiff = findInlineDiff(rightLine, leftLine);

          leftLines.push({
            content: leftLine || '',
            type: 'modified',
            inlineDiff: leftInlineDiff,
          });

          rightLines.push({
            content: rightLine || '',
            type: 'modified',
            inlineDiff: rightInlineDiff,
          });
        } else {
          // Line exists in left but not in right (removed)
          if (leftLine !== null) {
            leftLines.push({
              content: leftLine || '',
              type: 'removed',
            });
          }

          // Line exists in right but not in left (added)
          if (rightLine !== null) {
            rightLines.push({
              content: rightLine || '',
              type: 'added',
            });
          }
        }
      }
    }

    setDiffData({ leftLines, rightLines });
  }, [left, right, findInlineDiff]);

  // Function to find inline character differences between two strings
  function findInlineDiff(str1: string = '', str2: string = '') {
    const segments: { text: string; highlight: boolean }[] = [];

    // Use dynamic programming to find longest common subsequence
    const lcs = longestCommonSubsequence(str1, str2);

    let lcsIndex = 0;
    let currentSegment = { text: '', highlight: false };

    for (let i = 0; i < str1.length; i++) {
      const char = str1[i];

      // If character is part of LCS, it's not changed
      if (lcsIndex < lcs.length && char === lcs[lcsIndex]) {
        // If we were highlighting, end the segment and start a new one
        if (currentSegment.highlight) {
          if (currentSegment.text) {
            segments.push({ ...currentSegment });
          }
          currentSegment = { text: char || '', highlight: false };
        } else {
          currentSegment.text += char;
        }
        lcsIndex++;
      } else {
        // Character is different
        if (!currentSegment.highlight) {
          if (currentSegment.text) {
            segments.push({ ...currentSegment });
          }
          currentSegment = { text: char || '', highlight: true };
        } else {
          currentSegment.text += char;
        }
      }
    }

    // Add the last segment if it has content
    if (currentSegment.text) {
      segments.push(currentSegment);
    }

    return { segments };
  }

  // Function to find the longest common subsequence of two strings
  function longestCommonSubsequence(str1: string, str2: string): string {
    const m = str1.length;
    const n = str2.length;

    // Create a table to store lengths of LCS
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    // Fill the dp table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = (dp[i - 1]?.[j - 1] || 0) + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1]?.[j] || 0, dp[i]?.[j - 1] || 0);
        }
      }
    }

    // Reconstruct the LCS
    let lcs = '';
    let i = m,
      j = n;

    while (i > 0 && j > 0) {
      if (str1[i - 1] === str2[j - 1]) {
        lcs = str1[i - 1] + lcs;
        i--;
        j--;
      } else if ((dp[i - 1]?.[j] || 0) > (dp[i]?.[j - 1] || 0)) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  // Render an individual line with inline diff highlighting if applicable
  const renderLineContent = (line: DiffLine, side: 'left' | 'right') => {
    if (line.inlineDiff) {
      return line.inlineDiff.segments.map((segment, idx) => (
        <span
          key={`${side}-${idx}-segment-${idx}`}
          className={cn(
            segment.highlight &&
              side === 'left' &&
              'bg-red-200 dark:bg-red-800/40',
            segment.highlight &&
              side === 'right' &&
              'bg-green-200 dark:bg-green-800/40'
          )}
        >
          {segment.text}
        </span>
      ));
    }

    return line.content;
  };

  return (
    <div className={cn('max-h-80 overflow-auto rounded-md border', className)}>
      {/* Headers */}
      <div className="grid grid-cols-2 border-b bg-muted/30">
        <div className="border-r px-4 py-2 text-xs font-medium text-muted-foreground">
          {leftTitle}
        </div>
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
          {rightTitle}
        </div>
      </div>

      {/* Diff content */}
      <div className="grid grid-cols-2">
        {/* Left side */}
        <div className="border-r">
          <div className="relative font-mono text-xs">
            <div className={showLineNumbers ? 'ml-[28px]' : ''}>
              {diffData.leftLines.map((line, index) => (
                <div
                  key={`left-content-${index}`}
                  className={cn(
                    'min-h-[24px] px-2 py-1 leading-snug break-all whitespace-pre-wrap',
                    line.type === 'removed' &&
                      'border-l-2 border-red-500 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300',
                    line.type === 'modified' &&
                      'bg-amber-50/50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                  )}
                >
                  {renderLineContent(line, 'left')}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right side */}
        <div>
          <div className="relative font-mono text-xs">
            <div className={showLineNumbers ? 'ml-[28px]' : ''}>
              {diffData.rightLines.map((line, index) => (
                <div
                  key={`right-content-${index}`}
                  className={cn(
                    'min-h-[24px] px-2 py-1 leading-snug break-all whitespace-pre-wrap',
                    line.type === 'added' &&
                      'border-l-2 border-green-500 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300',
                    line.type === 'modified' &&
                      'bg-amber-50/50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                  )}
                >
                  {renderLineContent(line, 'right')}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
