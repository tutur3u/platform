import { ExternalLink, GitBranch, Plus, Power } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import Link from 'next/link';
import { connection } from 'next/server';
import { listRegisteredRepositories } from '@/lib/github/registry';
import {
  registerRepositoryAction,
  toggleRepositoryAction,
} from '../admin-actions';

export default async function RepositoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{
    added?: string;
    error?: string;
    updated?: string;
  }>;
}) {
  await connection();
  const [{ wsId }, query, repositories] = await Promise.all([
    params,
    searchParams,
    listRegisteredRepositories(),
  ]);

  return (
    <div className="space-y-6 p-1">
      <header className="space-y-2">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
          Tuturuuu Git
        </p>
        <h1 className="font-semibold text-2xl tracking-tight">
          Public repositories
        </h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Only repositories visible to the dedicated GitHub App installation can
          be registered.
        </p>
      </header>
      {query.error && (
        <Alert variant="destructive">
          <AlertTitle>Repository was not added</AlertTitle>
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      )}
      {(query.added || query.updated) && (
        <Alert>
          <AlertTitle>Registry updated</AlertTitle>
          <AlertDescription>
            Public repository access and cache state were refreshed.
          </AlertDescription>
        </Alert>
      )}
      <Card className="p-4">
        <form
          action={registerRepositoryAction.bind(null, wsId)}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <Input
            aria-label="GitHub repository"
            name="repository"
            placeholder="https://github.com/owner/repository"
            required
          />
          <Button type="submit">
            <Plus className="mr-2 h-4 w-4" />
            Add repository
          </Button>
        </form>
      </Card>
      <Card className="divide-y overflow-hidden">
        {repositories.map((repository) => (
          <div
            key={repository.id}
            className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          >
            <div className="flex min-w-0 gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border bg-muted">
                <GitBranch className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/${repository.owner}/${repository.name}`}
                    className="truncate font-semibold hover:underline"
                  >
                    {repository.owner}/{repository.name}
                  </Link>
                  <Badge variant={repository.enabled ? 'secondary' : 'outline'}>
                    {repository.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-muted-foreground text-xs">
                  {repository.description || 'No description'} ·{' '}
                  {repository.defaultBranch}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="ghost">
                <Link
                  href={`https://github.com/${repository.owner}/${repository.name}`}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  GitHub
                </Link>
              </Button>
              <form
                action={toggleRepositoryAction.bind(
                  null,
                  wsId,
                  repository.id,
                  !repository.enabled
                )}
              >
                <Button size="sm" type="submit" variant="outline">
                  <Power className="mr-2 h-4 w-4" />
                  {repository.enabled ? 'Disable' : 'Enable'}
                </Button>
              </form>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
