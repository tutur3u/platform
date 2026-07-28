import { CircleDot, ExternalLink, GitFork, Scale, Star } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import Link from 'next/link';
import type { RepositoryOverview } from '@/lib/github/types';
import { RepositoryCode } from './repository-code';
import { RepositoryMarkdown } from './repository-markdown';

function formatBytes(value: number) {
  if (value < 1024) return `${value} KB`;
  return `${(value / 1024).toFixed(1)} MB`;
}

export function RepositoryOverviewView({
  data,
  owner,
  repositoryName,
}: {
  data: RepositoryOverview;
  owner: string;
  repositoryName: string;
}) {
  const languageTotal = Object.values(data.languages).reduce(
    (total, value) => total + value,
    0
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <RepositoryCode
          content={data.rootContent}
          owner={owner}
          refName={data.repository.default_branch}
          repository={repositoryName}
        />
        {data.readme && (
          <Card className="overflow-hidden">
            <div className="border-b bg-muted/20 px-4 py-2.5 font-mono font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
              README
            </div>
            <RepositoryMarkdown
              className="p-4 sm:p-6"
              context={{
                owner,
                refName: data.repository.default_branch,
                repository: repositoryName,
                sourcePath: data.readme.path,
              }}
            >
              {data.readme.content}
            </RepositoryMarkdown>
          </Card>
        )}
      </div>
      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <section className="space-y-2.5">
          <h1 className="font-semibold text-lg tracking-tight">
            {data.repository.name}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {data.repository.description || 'No repository description.'}
          </p>
          {data.repository.homepage && (
            <Link
              href={data.repository.homepage}
              className="flex items-center gap-1.5 truncate font-medium text-sm underline underline-offset-4"
            >
              <ExternalLink className="h-4 w-4" />
              {data.repository.homepage.replace(/^https?:\/\//u, '')}
            </Link>
          )}
          <div className="flex flex-wrap gap-1">
            {data.repository.topics.map((topic) => (
              <Badge
                className="h-5 px-1.5 text-[10px]"
                key={topic}
                variant="secondary"
              >
                {topic}
              </Badge>
            ))}
          </div>
        </section>
        <section className="grid grid-cols-2 gap-2">
          <Metric
            icon={Star}
            label="Stars"
            value={data.repository.stargazers_count}
          />
          <Metric
            icon={GitFork}
            label="Forks"
            value={data.repository.forks_count}
          />
          <Metric
            icon={CircleDot}
            label="Open"
            value={data.repository.open_issues_count}
          />
          <Metric
            icon={Scale}
            label="Size"
            value={formatBytes(data.repository.size)}
          />
        </section>
        <section className="space-y-2.5 border-t pt-4">
          <h2 className="font-semibold text-sm">Languages</h2>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            {Object.entries(data.languages).map(([language, bytes], index) => (
              <span
                key={language}
                className={index % 2 === 0 ? 'bg-primary' : 'bg-foreground/40'}
                style={{
                  width: `${languageTotal ? (bytes / languageTotal) * 100 : 0}%`,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground text-xs">
            {Object.entries(data.languages)
              .sort((left, right) => right[1] - left[1])
              .slice(0, 8)
              .map(([language, bytes]) => (
                <span key={language}>
                  <strong className="font-medium text-foreground">
                    {language}
                  </strong>{' '}
                  {languageTotal
                    ? `${((bytes / languageTotal) * 100).toFixed(1)}%`
                    : '0%'}
                </span>
              ))}
          </div>
        </section>
        {data.repository.license && (
          <section className="flex items-center gap-2 border-t pt-4 text-sm">
            <Scale className="h-4 w-4 text-muted-foreground" />
            {data.repository.license.name}
          </section>
        )}
      </aside>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-card/50 p-2.5">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <div className="font-semibold text-sm">{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
