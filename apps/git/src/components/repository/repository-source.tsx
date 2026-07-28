import { cn } from '@tuturuuu/utils/format';
import { RepositorySyntaxSource } from './repository-syntax-source';
import { RepositoryVirtualSource } from './repository-virtual-source';

const MAX_HIGHLIGHT_BYTES = 150_000;
const MAX_HIGHLIGHT_LINES = 2_000;

export function RepositorySource({
  className,
  filename,
  source,
}: {
  className?: string;
  filename: string;
  source: string;
}) {
  const lineCount = countLines(source);
  const byteLength = Buffer.byteLength(source);
  const sharedClassName = cn(
    'repository-source min-w-0 overflow-hidden',
    className
  );

  if (byteLength > MAX_HIGHLIGHT_BYTES || lineCount > MAX_HIGHLIGHT_LINES) {
    return (
      <RepositoryVirtualSource className={sharedClassName} source={source} />
    );
  }

  return (
    <RepositorySyntaxSource
      className={sharedClassName}
      filename={filename}
      source={source}
    />
  );
}

export function countLines(source: string) {
  if (!source) return 0;
  let count = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) count += 1;
  }
  return count;
}

export function shouldVirtualizeSource(source: string) {
  return (
    Buffer.byteLength(source) > MAX_HIGHLIGHT_BYTES ||
    countLines(source) > MAX_HIGHLIGHT_LINES
  );
}
