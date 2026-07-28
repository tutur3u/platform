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
import Link from 'next/link';
import type { GitHubContent } from '@/lib/github/types';

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

    return (
      <Card className="overflow-hidden">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4">
          <div className="min-w-0 truncate font-mono text-sm">
            {content.path}
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
        {source ? (
          <pre className="max-h-[75vh] overflow-auto bg-foreground/[0.025] p-5 font-mono text-[13px] leading-6">
            <code>{source}</code>
          </pre>
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
