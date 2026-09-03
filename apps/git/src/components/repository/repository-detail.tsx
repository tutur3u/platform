import {
  CheckCircle2,
  CircleDot,
  Clock,
  GitCommitHorizontal,
  GitPullRequest,
  MessageSquare,
  Play,
  XCircle,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import Link from 'next/link';
import type {
  GitHubIssueComment,
  GitHubPullFile,
  GitHubPullReview,
  GitHubWorkflowArtifact,
  GitHubWorkflowJob,
} from '@/lib/github/types';
import {
  type DetailCollectionPage,
  RepositoryDetailPagination,
} from './repository-detail-pagination';
import {
  PullFilesSection,
  PullReviewsSection,
  WorkflowArtifactsSection,
  WorkflowJobsSection,
} from './repository-detail-sections';
import { RepositoryMarkdown } from './repository-markdown';
import { RepositorySource } from './repository-source';

export function IssueDetail({
  data,
}: {
  data: {
    comments: DetailCollectionPage<GitHubIssueComment>;
    issue: Awaited<
      ReturnType<typeof import('@/lib/github/queries').getRepositoryIssue>
    >;
  };
}) {
  return (
    <DetailFrame
      icon={<CircleDot className="h-5 w-5" />}
      state={data.issue.state}
      subtitle={`#${data.issue.number} opened by ${data.issue.user?.login ?? 'Unknown'}`}
      title={data.issue.title}
    >
      <MarkdownCard
        avatar={data.issue.user?.avatar_url}
        body={data.issue.body}
        login={data.issue.user?.login ?? 'Unknown'}
      />
      {data.comments.items.map((comment) => (
        <MarkdownCard
          key={comment.id}
          avatar={comment.user?.avatar_url}
          body={comment.body}
          login={comment.user?.login ?? 'Unknown'}
        />
      ))}
      <Card className="overflow-hidden py-0">
        <RepositoryDetailPagination {...data.comments} />
      </Card>
    </DetailFrame>
  );
}

export function PullDetail({
  data,
  reviewsTitle,
}: {
  data: {
    files: DetailCollectionPage<GitHubPullFile>;
    pull: Awaited<
      ReturnType<typeof import('@/lib/github/queries').getRepositoryPull>
    >;
    reviews: DetailCollectionPage<GitHubPullReview>;
  };
  reviewsTitle: string;
}) {
  return (
    <DetailFrame
      icon={<GitPullRequest className="h-5 w-5" />}
      state={data.pull.state}
      subtitle={`#${data.pull.number} · ${data.pull.commits} commits · ${data.pull.changed_files} files`}
      title={data.pull.title}
    >
      <MarkdownCard
        avatar={data.pull.user?.avatar_url}
        body={data.pull.body}
        login={data.pull.user?.login ?? 'Unknown'}
      />
      <PullFilesSection files={data.files} />
      <PullReviewsSection reviews={data.reviews} title={reviewsTitle} />
    </DetailFrame>
  );
}

export function CommitDetail({
  commit,
}: {
  commit: Awaited<
    ReturnType<typeof import('@/lib/github/queries').getRepositoryCommit>
  >;
}) {
  return (
    <DetailFrame
      icon={<GitCommitHorizontal className="h-5 w-5" />}
      state="commit"
      subtitle={`${commit.sha} · ${commit.commit.author?.name ?? 'Unknown'}`}
      title={commit.commit.message.split('\n')[0] || commit.sha}
    >
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <span className="font-semibold text-sm">Checks and statuses</span>
          <Badge variant="outline">{commit.combinedStatus}</Badge>
        </div>
        <div className="divide-y">
          {commit.checkRuns.map((check) => (
            <StatusRow
              key={`check-${check.id}`}
              href={check.html_url}
              label={check.name}
              state={check.conclusion ?? check.status}
            />
          ))}
          {commit.statuses.map((status) => (
            <StatusRow
              key={`status-${status.id}`}
              href={status.target_url}
              label={status.context}
              state={status.state}
            />
          ))}
          {!commit.checkRuns.length && !commit.statuses.length && (
            <p className="p-4 text-muted-foreground text-sm">
              No checks or commit statuses were reported.
            </p>
          )}
        </div>
      </Card>
      <Card className="divide-y overflow-hidden">
        {(commit.files ?? []).map((file) => (
          <div key={file.filename} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <code className="truncate text-xs">{file.filename}</code>
              <Badge variant="outline">
                +{file.additions} −{file.deletions}
              </Badge>
            </div>
            {file.patch && (
              <RepositorySource
                className="rounded-md border bg-muted/15"
                filename={`${file.filename}.diff`}
                source={file.patch}
              />
            )}
          </div>
        ))}
      </Card>
    </DetailFrame>
  );
}

export function ActionRunDetail({
  data,
}: {
  data: {
    artifacts: DetailCollectionPage<GitHubWorkflowArtifact>;
    jobs: DetailCollectionPage<GitHubWorkflowJob>;
    run: Awaited<
      ReturnType<typeof import('@/lib/github/queries').getRepositoryActionRun>
    >;
  };
}) {
  return (
    <DetailFrame
      icon={<Play className="h-5 w-5" />}
      state={data.run.conclusion ?? data.run.status}
      subtitle={`Run #${data.run.run_number} · ${data.run.event} · ${data.run.head_sha.slice(0, 7)}`}
      title={data.run.name}
    >
      <WorkflowJobsSection jobs={data.jobs} />
      <WorkflowArtifactsSection artifacts={data.artifacts} />
    </DetailFrame>
  );
}

export function ComparisonDetail({
  base,
  data,
  head,
}: {
  base: string;
  data: Awaited<
    ReturnType<typeof import('@/lib/github/queries').getRepositoryComparison>
  >;
  head: string;
}) {
  return (
    <DetailFrame
      icon={<GitCommitHorizontal className="h-5 w-5" />}
      state={data.status}
      subtitle={`${data.ahead_by} ahead · ${data.behind_by} behind`}
      title={`${base}…${head}`}
    >
      <Card className="divide-y overflow-hidden">
        {(data.files ?? []).map((file) => (
          <div key={file.filename} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <code className="truncate text-xs">{file.filename}</code>
              <Badge variant="outline">
                +{file.additions} −{file.deletions}
              </Badge>
            </div>
            {file.patch && (
              <RepositorySource
                className="rounded-md border bg-muted/15"
                filename={`${file.filename}.diff`}
                source={file.patch}
              />
            )}
          </div>
        ))}
      </Card>
    </DetailFrame>
  );
}

function StatusRow({
  href,
  label,
  state,
}: {
  href: string | null;
  label: string;
  state: string;
}) {
  const Icon =
    state === 'success'
      ? CheckCircle2
      : state === 'failure' || state === 'error'
        ? XCircle
        : state === 'in_progress' || state === 'pending'
          ? Clock
          : CircleDot;
  const content = (
    <>
      <span className="flex items-center gap-2 font-medium text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <Badge variant="outline">{state}</Badge>
    </>
  );

  return href ? (
    <Link
      className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40"
      href={href}
    >
      {content}
    </Link>
  ) : (
    <div className="flex items-center justify-between gap-3 p-4">{content}</div>
  );
}

function DetailFrame({
  children,
  icon,
  state,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  state: string;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 text-muted-foreground">{icon}</span>
          <h1 className="font-semibold text-2xl leading-tight tracking-tight md:text-3xl">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Badge variant="secondary">{state}</Badge>
          <span>{subtitle}</span>
        </div>
      </header>
      {children}
    </section>
  );
}

function MarkdownCard({
  avatar,
  body,
  login,
}: {
  avatar?: string;
  body: string | null;
  login: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <Avatar className="h-7 w-7">
          <AvatarImage src={avatar} alt="" />
          <AvatarFallback>
            <MessageSquare className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
        <span className="font-semibold text-sm">{login}</span>
      </div>
      <RepositoryMarkdown className="p-5">
        {body || '_No description provided._'}
      </RepositoryMarkdown>
    </Card>
  );
}
