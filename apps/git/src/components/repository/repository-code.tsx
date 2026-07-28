import {
  ChevronRight,
  Download,
  File,
  Folder,
  GitBranch,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { formatBytes } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { GitHubContent } from '@/lib/github/types';
import { RepositoryMarkdown } from './repository-markdown';
import { RepositorySource } from './repository-source';

function buildPath(
  owner: string,
  repository: string,
  view: 'blob' | 'tree',
  path: string,
  refName: string
) {
  return `/${owner}/${repository}/${view}/${path}?ref=${encodeURIComponent(refName)}`;
}

export function RepositoryCode({
  content,
  owner,
  refName,
  repository,
}: {
  content: GitHubContent | GitHubContent[];
  owner: string;
  refName: string;
  repository: string;
}) {
  if (!Array.isArray(content)) {
    const source = content.content
      ? Buffer.from(content.content.replaceAll('\n', ''), 'base64').toString(
          'utf8'
        )
      : null;
    const lineCount = source ? countSourceLines(source) : 0;

    return (
      <Card className="overflow-hidden">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 truncate font-mono text-sm">
              {content.path}
            </div>
            {source ? (
              <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">
                {lineCount.toLocaleString()} lines · {formatBytes(content.size)}
              </span>
            ) : null}
          </div>
          {content.download_url && (
            <Button asChild size="sm" variant="ghost">
              <Link href={content.download_url}>
                <Download className="mr-2 h-4 w-4" />
                Raw
              </Link>
            </Button>
          )}
        </div>
        {source && /\.md(?:own)?$/iu.test(content.path) ? (
          <RepositoryMarkdown
            className="p-6"
            context={{
              owner,
              refName,
              repository,
              sourcePath: content.path,
            }}
          >
            {source}
          </RepositoryMarkdown>
        ) : source ? (
          <RepositorySource
            className="bg-muted/15"
            filename={content.path}
            source={source}
          />
        ) : (
          <div className="p-10 text-center text-muted-foreground text-sm">
            This file is binary or too large to render.
          </div>
        )}
      </Card>
    );
  }

  const sorted = [...content].sort((left, right) => {
    if (left.type === right.type) return left.name.localeCompare(right.name);
    return left.type === 'dir' ? -1 : 1;
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-12 items-center gap-3 border-b px-4">
        <Badge variant="outline" className="gap-2 font-mono">
          <GitBranch className="h-3.5 w-3.5" />
          {refName}
        </Badge>
        <span className="truncate font-mono text-muted-foreground text-xs">
          {content[0]?.path.split('/').slice(0, -1).join('/') || '/'}
        </span>
      </div>
      <div className="divide-y">
        {sorted.map((entry) => {
          const isDirectory = entry.type === 'dir';
          const Icon = isDirectory ? Folder : File;
          return (
            <Link
              key={entry.sha}
              href={buildPath(
                owner,
                repository,
                isDirectory ? 'tree' : 'blob',
                entry.path,
                refName
              )}
              className="group grid min-h-11 grid-cols-[24px_minmax(0,1fr)_20px] items-center gap-2 px-4 text-sm transition-colors hover:bg-muted/50"
              style={{ contentVisibility: 'auto' }}
            >
              <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              <span className="truncate font-mono">{entry.name}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function countSourceLines(source: string) {
  if (!source) return 0;
  let count = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) count += 1;
  }
  return count;
}
