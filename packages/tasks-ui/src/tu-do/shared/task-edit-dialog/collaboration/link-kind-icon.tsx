import {
  ExternalLink,
  FileText,
  GitCommitHorizontal,
  GitPullRequest,
  CircleDot,
  Workflow,
} from '@tuturuuu/icons';
import type { TaskLinkKind } from './types';

const ICONS = {
  pull_request: GitPullRequest,
  commit: GitCommitHorizontal,
  ci_run: Workflow,
  issue: CircleDot,
  doc: FileText,
  url: ExternalLink,
} satisfies Record<TaskLinkKind, unknown>;

export function LinkKindIcon({
  kind,
  className,
}: {
  kind: TaskLinkKind;
  className?: string;
}) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden className={className} />;
}
