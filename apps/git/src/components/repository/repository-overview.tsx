import { CircleDot, ExternalLink, GitFork, Scale, Star } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import type { RepositoryOverview } from '@/lib/github/types';
import { RepositoryCode } from './repository-code';

function formatBytes(value: number) {
  if (value < 1024) return `${value} KB`;
  return `${(value / 1024).toFixed(1)} MB`;
}

export async function RepositoryOverviewView({
  data,
  owner,
  repositoryName,
}: {
  data: RepositoryOverview;
  owner: string;
  repositoryName: string;
}) {
  const rootContent = await import('@/lib/github/queries').then(
    ({ getRepositoryContent }) =>
      getRepositoryContent(
        owner,
        repositoryName,
        '',
        data.repository.default_branch
      )
  );
  const languageTotal = Object.values(data.languages).reduce(
    (total, value) => total + value,
    0
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <RepositoryCode
          content={rootContent}
          owner={owner}
          refName={data.repository.default_branch}
          repository={repositoryName}
        />
        {data.readme && (
          <Card className="overflow-hidden">
            <div className="border-b px-5 py-3 font-mono font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
              README
            </div>
            <article className="prose prose-neutral dark:prose-invert max-w-none overflow-hidden prose-pre:overflow-x-auto p-6">
              <ReactMarkdown>{data.readme}</ReactMarkdown>
            </article>
          </Card>
        )}
      </div>
      <aside className="space-y-6">
        <section className="space-y-3">
          <h1 className="font-semibold text-xl tracking-tight">
            {data.repository.name}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {data.repository.description || 'No repository description.'}
          </p>
          {data.repository.homepage && (
            <Link
              href={data.repository.homepage}
              className="flex items-center gap-2 font-medium text-primary text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              {data.repository.homepage.replace(/^https?:\/\//u, '')}
            </Link>
          )}
          <div className="flex flex-wrap gap-2">
            {data.repository.topics.map((topic) => (
              <Badge key={topic} variant="secondary">
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
        <section className="space-y-3 border-t pt-5">
          <h2 className="font-semibold text-sm">Languages</h2>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
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
          <section className="flex items-center gap-3 border-t pt-5 text-sm">
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
    <div className="rounded-lg border p-3">
      <Icon className="mb-3 h-4 w-4 text-muted-foreground" />
      <div className="font-semibold text-lg">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
