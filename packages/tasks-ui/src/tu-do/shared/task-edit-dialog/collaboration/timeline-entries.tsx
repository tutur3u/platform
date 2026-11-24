import {
  Download,
  GitBranch,
  Link2,
  MessageSquare,
  Pencil,
  Trash2,
  Unlink,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { ReactNode } from 'react';
import type { TaskHistoryEntry } from './activity-entries';
import { CommentBody } from './comment-body';

export type CollaborationTranslate = (
  key: string,
  values?: Record<string, string>
) => string;

export interface CollaborationEntry {
  icon: ReactNode;
  color: string;
  action: string;
  details?: ReactNode;
}

const ICON = 'h-3.5 w-3.5';

function str(value: unknown) {
  return typeof value === 'string' && value ? value : null;
}

function linkLabel(entry: TaskHistoryEntry) {
  const { title, external_id: externalId, url } = entry.metadata;
  return (
    str(title) ??
    (str(externalId) ? `#${str(externalId)}` : null) ??
    str(url)?.replace(/^https:\/\//, '') ??
    null
  );
}

/** The external_event verb: closed, reopened, or a neutral fallback. */
function externalEventVerb(entry: TaskHistoryEntry, t: CollaborationTranslate) {
  const raw = [
    entry.metadata.event,
    entry.metadata.action,
    entry.metadata.state,
    entry.new_value,
  ].find((value) => typeof value === 'string');
  const key = String(raw ?? '').toLowerCase();
  if (key === 'closed') return t('timeline.external_closed');
  if (key === 'reopened') return t('timeline.external_reopened');
  return t('timeline.external_event');
}

/**
 * Icon, label and details for the comment, link and external change types.
 * Returns null for every other change type.
 */
export function getCollaborationEntry(
  entry: TaskHistoryEntry,
  t: CollaborationTranslate
): CollaborationEntry | null {
  switch (entry.change_type) {
    case 'comment_added':
      return {
        icon: <MessageSquare className={`${ICON} text-dynamic-blue`} />,
        color: 'bg-dynamic-blue/10',
        action: t('timeline.comment_added'),
      };
    case 'comment_updated':
      return {
        icon: <Pencil className={`${ICON} text-dynamic-orange`} />,
        color: 'bg-dynamic-orange/10',
        action: t('timeline.comment_updated'),
      };
    case 'comment_deleted':
      return {
        icon: <Trash2 className={`${ICON} text-dynamic-red`} />,
        color: 'bg-dynamic-red/10',
        action: t('timeline.comment_deleted'),
      };
    case 'link_added':
    case 'link_removed': {
      const added = entry.change_type === 'link_added';
      const label = linkLabel(entry);
      return {
        icon: added ? (
          <Link2 className={`${ICON} text-dynamic-green`} />
        ) : (
          <Unlink className={`${ICON} text-dynamic-red`} />
        ),
        color: added ? 'bg-dynamic-green/10' : 'bg-dynamic-red/10',
        action: added ? t('timeline.link_added') : t('timeline.link_removed'),
        details: label ? (
          <Badge
            className={added ? 'text-xs' : 'text-xs opacity-70'}
            variant={added ? 'secondary' : 'outline'}
          >
            {label}
          </Badge>
        ) : undefined,
      };
    }
    case 'external_imported': {
      const number =
        str(entry.metadata.number) ?? String(entry.metadata.number ?? '');
      return {
        icon: <Download className={`${ICON} text-dynamic-purple`} />,
        color: 'bg-dynamic-purple/10',
        action: t('timeline.external_imported'),
        details: number ? (
          <Badge className="gap-1 text-xs" variant="secondary">
            <GitBranch aria-hidden className="h-3 w-3" />
            {`${t('github')} #${number}`}
          </Badge>
        ) : undefined,
      };
    }
    case 'external_event':
      return {
        icon: <GitBranch className={`${ICON} text-dynamic-indigo`} />,
        color: 'bg-dynamic-indigo/10',
        action: externalEventVerb(entry, t),
      };
    default:
      return null;
  }
}

/** The markdown body shown under a comment_added event. */
export function TimelineCommentBody({ entry }: { entry: TaskHistoryEntry }) {
  if (entry.change_type !== 'comment_added' || !entry.comment) return null;
  return (
    <div className="mt-1 rounded-md border bg-background/60 px-3 py-2">
      <CommentBody body={entry.comment.body} />
    </div>
  );
}
