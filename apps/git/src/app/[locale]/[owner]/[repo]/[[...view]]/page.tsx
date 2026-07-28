import { Card } from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RepositoryCode } from '@/components/repository/repository-code';
import {
  type CollectionItem,
  RepositoryCollection,
} from '@/components/repository/repository-collection';
import { toCollectionRow } from '@/components/repository/repository-collection-types';
import {
  ActionRunDetail,
  CommitDetail,
  ComparisonDetail,
  IssueDetail,
  PullDetail,
} from '@/components/repository/repository-detail';
import { RepositoryOverviewView } from '@/components/repository/repository-overview';
import { GitHubMirrorError } from '@/lib/github/errors';
import {
  getRepositoryActionRun,
  getRepositoryActions,
  getRepositoryBranches,
  getRepositoryCommit,
  getRepositoryCommits,
  getRepositoryComparison,
  getRepositoryContent,
  getRepositoryContributors,
  getRepositoryIssue,
  getRepositoryIssues,
  getRepositoryMetadata,
  getRepositoryOverview,
  getRepositoryPull,
  getRepositoryPulls,
  getRepositoryReleases,
  getRepositoryTags,
} from '@/lib/github/queries';

type PageProps = {
  params: Promise<{
    locale: string;
    owner: string;
    repo: string;
    view?: string[];
  }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    ref?: string;
  }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { owner, repo } = await params;
  return {
    description: `Browse ${owner}/${repo} on Tuturuuu Git`,
    title: `${owner}/${repo} · Tuturuuu Git`,
  };
}

export default async function RepositoryPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, owner, repo, view = [] } = await params;
  const query = await searchParams;
  const activeView = resolveActiveView(view);

  try {
    if (activeView === 'overview') {
      const overview = await getRepositoryOverview(owner, repo);
      return (
        <RepositoryOverviewView
          data={overview}
          owner={owner}
          repositoryName={repo}
        />
      );
    }

    return await renderView({
      activeView,
      owner,
      query,
      repo,
      view,
    });
  } catch (error) {
    if (error instanceof GitHubMirrorError && error.status === 404) {
      notFound();
    }

    if (
      error instanceof GitHubMirrorError &&
      (error.code === 'github_rate_limited' ||
        error.code === 'github_access_denied' ||
        error.code === 'github_request_failed')
    ) {
      const t = await getTranslations({ locale, namespace: 'git' });
      const rateLimited = error.code === 'github_rate_limited';
      return (
        <RepositoryFailure
          description={
            rateLimited
              ? t('rate_limited_description')
              : t('github_unavailable_description')
          }
          title={rateLimited ? t('rate_limited') : t('github_unavailable')}
        />
      );
    }

    throw error;
  }
}

async function renderView({
  activeView,
  owner,
  query,
  repo,
  view,
}: {
  activeView: string;
  owner: string;
  query: { page?: string; q?: string; ref?: string };
  repo: string;
  view: string[];
}) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);

  if (activeView === 'tree' || activeView === 'blob') {
    const path = view.slice(1).join('/');
    const [content, repository] = await Promise.all([
      getRepositoryContent(owner, repo, path, query.ref),
      query.ref ? null : getRepositoryMetadata(owner, repo),
    ]);
    return (
      <RepositoryCode
        content={content}
        owner={owner}
        refName={query.ref ?? repository?.default_branch ?? 'HEAD'}
        repository={repo}
      />
    );
  }

  if (activeView === 'commits') {
    const commits = await getRepositoryCommits(owner, repo, page);
    return collection(
      'Commits',
      commits.map((value) => ({ kind: 'commit', value })),
      owner,
      repo,
      query.q
    );
  }

  if (activeView === 'issues' && view[1]) {
    const number = Number.parseInt(view[1], 10);
    if (!Number.isFinite(number)) notFound();
    return <IssueDetail data={await getRepositoryIssue(owner, repo, number)} />;
  }

  if (activeView === 'issues') {
    const issues = await getRepositoryIssues(owner, repo, page);
    return collection(
      'Issues',
      issues.map((value) => ({ kind: 'issue', value })),
      owner,
      repo,
      query.q
    );
  }

  if (activeView === 'pull' && view[1]) {
    const number = Number.parseInt(view[1], 10);
    if (!Number.isFinite(number)) notFound();
    return <PullDetail data={await getRepositoryPull(owner, repo, number)} />;
  }

  if (activeView === 'pulls') {
    const pulls = await getRepositoryPulls(owner, repo, page);
    return collection(
      'Pull requests',
      pulls.map((value) => ({ kind: 'pull', value })),
      owner,
      repo,
      query.q
    );
  }

  if (activeView === 'actions' && view[1]) {
    const runId = Number.parseInt(view[1], 10);
    if (!Number.isFinite(runId)) notFound();
    return (
      <ActionRunDetail
        data={await getRepositoryActionRun(owner, repo, runId)}
      />
    );
  }

  if (activeView === 'actions') {
    const runs = await getRepositoryActions(owner, repo, page);
    return collection(
      'Workflow runs',
      runs.map((value) => ({ kind: 'run', value })),
      owner,
      repo,
      query.q
    );
  }

  if (activeView === 'releases') {
    const releases = await getRepositoryReleases(owner, repo, page);
    return collection(
      'Releases',
      releases.map((value) => ({ kind: 'release', value })),
      owner,
      repo,
      query.q
    );
  }

  if (activeView === 'contributors') {
    const contributors = await getRepositoryContributors(owner, repo, page);
    return collection(
      'Contributors',
      contributors.map((value) => ({ kind: 'contributor', value })),
      owner,
      repo,
      query.q
    );
  }

  if (activeView === 'branches') {
    const branches = await getRepositoryBranches(owner, repo);
    return collection(
      'Branches',
      branches.map((value) => ({ kind: 'ref', value })),
      owner,
      repo,
      query.q
    );
  }

  if (activeView === 'tags') {
    const tags = await getRepositoryTags(owner, repo);
    return collection(
      'Tags',
      tags.map((value) => ({ kind: 'ref', value })),
      owner,
      repo,
      query.q
    );
  }

  if (activeView === 'commit' && view[1]) {
    return (
      <CommitDetail commit={await getRepositoryCommit(owner, repo, view[1])} />
    );
  }

  if (activeView === 'compare' && view[1]) {
    const [base, head] = view[1].split('...');
    if (!base || !head) notFound();
    return (
      <ComparisonDetail
        base={base}
        data={await getRepositoryComparison(owner, repo, base, head)}
        head={head}
      />
    );
  }

  notFound();
}

function RepositoryFailure({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="max-w-lg space-y-3 p-6 text-center">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
      </Card>
    </main>
  );
}

function collection(
  title: string,
  items: CollectionItem[],
  owner: string,
  repository: string,
  query?: string
) {
  return (
    <RepositoryCollection
      emptyMessage={`No ${title.toLowerCase()} found.`}
      owner={owner}
      repository={repository}
      rows={items.map((item) => toCollectionRow(item, owner, repository))}
      searchQuery={query}
      title={title}
    />
  );
}

function resolveActiveView(view: string[]) {
  if (!view.length) return 'overview';
  return view[0] ?? 'overview';
}
