import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import Link from 'next/link';
import type {
  GitHubPullFile,
  GitHubPullReview,
  GitHubWorkflowArtifact,
  GitHubWorkflowJob,
} from '@/lib/github/types';
import {
  type DetailCollectionPage,
  RepositoryDetailPagination,
} from './repository-detail-pagination';
import { RepositoryMarkdown } from './repository-markdown';
import { RepositorySource } from './repository-source';

export function PullFilesSection({
  files,
}: {
  files: DetailCollectionPage<GitHubPullFile>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3 font-semibold text-sm">
        Changed files
      </div>
      <div className="divide-y">
        {files.items.map((file) => (
          <div key={file.filename} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <code className="truncate text-xs">{file.filename}</code>
              <Badge variant="outline">
                +{file.additions} −{file.deletions}
              </Badge>
            </div>
            {file.patch ? (
              <RepositorySource
                className="rounded-md border bg-muted/15"
                filename={`${file.filename}.diff`}
                source={file.patch}
              />
            ) : null}
          </div>
        ))}
      </div>
      <RepositoryDetailPagination {...files} />
    </Card>
  );
}

export function PullReviewsSection({
  reviews,
  title,
}: {
  reviews: DetailCollectionPage<GitHubPullReview>;
  title: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3 font-semibold text-sm">{title}</div>
      <div className="divide-y">
        {reviews.items.map((review) => (
          <div key={review.id} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-sm">{review.user.login}</span>
              <Badge variant="outline">{review.state}</Badge>
            </div>
            {review.body ? (
              <RepositoryMarkdown>{review.body}</RepositoryMarkdown>
            ) : null}
          </div>
        ))}
      </div>
      <RepositoryDetailPagination {...reviews} />
    </Card>
  );
}

export function WorkflowJobsSection({
  jobs,
}: {
  jobs: DetailCollectionPage<GitHubWorkflowJob>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3 font-semibold text-sm">Jobs</div>
      <div className="divide-y">
        {jobs.items.map((job) => (
          <div key={job.id} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <Link className="font-medium hover:underline" href={job.html_url}>
                {job.name}
              </Link>
              <Badge variant="outline">{job.conclusion ?? job.status}</Badge>
            </div>
            {job.steps?.length ? (
              <div className="grid gap-1 text-muted-foreground text-xs">
                {job.steps.map((step) => (
                  <div
                    key={`${job.id}-${step.number}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>
                      {step.number}. {step.name}
                    </span>
                    <span>{step.conclusion ?? step.status}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <RepositoryDetailPagination {...jobs} />
    </Card>
  );
}

export function WorkflowArtifactsSection({
  artifacts,
}: {
  artifacts: DetailCollectionPage<GitHubWorkflowArtifact>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3 font-semibold text-sm">Artifacts</div>
      <div className="divide-y">
        {artifacts.items.length ? (
          artifacts.items.map((artifact) => (
            <div
              key={artifact.id}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-medium">{artifact.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatBytes(artifact.size_in_bytes)}
                  {artifact.expired ? ' · expired' : ''}
                </p>
              </div>
              <Badge variant="outline">
                {artifact.expired ? 'Expired' : 'Available'}
              </Badge>
            </div>
          ))
        ) : (
          <p className="p-4 text-muted-foreground text-sm">
            No artifacts were retained for this run.
          </p>
        )}
      </div>
      <RepositoryDetailPagination {...artifacts} />
    </Card>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
