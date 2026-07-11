import { useInViewport } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Pencil,
  Shield,
  Trash2,
} from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo } from 'react';
import { PostEmailStatus } from './post';
import type { UserGroupPost } from './use-posts';

function PostCompletionBadge({
  wsId,
  groupId,
  postId,
}: {
  wsId: string;
  groupId: string;
  postId: string;
}) {
  const { ref, inViewport } = useInViewport();

  const { data } = useQuery<{
    sent: number | null;
    checked: number | null;
    failed: number | null;
    tentative: number | null;
    missing_check?: number | null;
    count: number | null;
  }>({
    queryKey: ['user-group-post-email-status', groupId, postId],
    enabled: Boolean(inViewport && wsId && groupId && postId),
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/posts/${postId}/status`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error('Failed to fetch post status');
      return response.json();
    },
    staleTime: 30_000,
  });

  if (!data?.count) return <div ref={ref} />;

  const completed = data.checked ?? 0;
  const total = data.count;
  const allDone = completed >= total;

  return (
    <div ref={ref}>
      <div
        className={cn(
          'flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold text-xs',
          allDone
            ? 'bg-dynamic-green/15 text-dynamic-green'
            : 'bg-foreground/5 text-foreground/60'
        )}
      >
        <Check className="h-3 w-3" />
        {completed}/{total}
      </div>
    </div>
  );
}

interface PostItemProps {
  post: UserGroupPost;
  wsId: string;
  groupId?: string;
  selectedPostId?: string;
  onClick?: (id: string) => void;
  canUpdatePosts: boolean;
  canDeletePosts: boolean;
  configs: { showContent: boolean; showStatus: boolean };
  onEdit: (post: UserGroupPost) => void;
  onDelete: (postId: string) => void;
}

// Memoized post item component to prevent re-renders when parent state changes
export const PostItem = memo(function PostItem({
  post,
  wsId,
  groupId,
  selectedPostId,
  onClick,
  canUpdatePosts,
  canDeletePosts,
  configs,
  onEdit,
  onDelete,
}: PostItemProps) {
  const t = useTranslations();

  const handleClick = () => {
    if (post.id && onClick) {
      onClick(post.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onClick) return;
    if ((e.key === 'Enter' || e.key === ' ') && post.id) {
      e.preventDefault();
      onClick(post.id);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(post);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.id) {
      onDelete(post.id);
    }
  };

  return (
    <div
      key={post.id}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      className={cn(
        'flex flex-col gap-2 rounded border p-2 transition duration-300 hover:border-foreground hover:bg-foreground/5',
        selectedPostId === post.id && 'border-foreground bg-foreground/5',
        onClick ? 'cursor-pointer' : ''
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-left font-semibold text-sm">{post.title}</div>
          <div className="flex flex-wrap items-center gap-2 font-semibold">
            {post.created_at && (
              <div className="flex items-center gap-0.5 text-xs opacity-70">
                <Clock className="h-3 w-3" />
                {format(new Date(post.created_at), 'HH:mm, dd/MM/yyyy')}
              </div>
            )}
            {post.post_approval_status === 'APPROVED' && (
              <div className="flex w-fit items-center gap-0.5 rounded bg-dynamic-green px-2 py-1 text-background text-xs">
                <CheckCircle2 className="h-3 w-3" />
                {t('approvals.status.approved')}
              </div>
            )}
            {post.post_approval_status === 'PENDING' && (
              <div className="flex w-fit items-center gap-0.5 rounded bg-dynamic-orange px-2 py-1 text-background text-xs">
                <Shield className="h-3 w-3" />
                {t('ws-user-groups.post_needs_approval')}
              </div>
            )}
            {post.post_approval_status === 'REJECTED' && (
              <div className="flex w-fit items-center gap-0.5 rounded bg-dynamic-red px-2 py-1 text-background text-xs">
                <AlertCircle className="h-3 w-3" />
                {t('ws-user-groups.post_rejected')}
              </div>
            )}
            {groupId && post.id && (
              <PostCompletionBadge
                wsId={wsId}
                groupId={groupId}
                postId={post.id}
              />
            )}
          </div>
        </div>
        {groupId && (
          <div className="flex gap-2 text-start">
            <Link
              href={
                groupId
                  ? `/${wsId}/users/groups/${groupId}/posts/${post.id}`
                  : '#'
              }
            >
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => e.stopPropagation()}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </Link>
            {canUpdatePosts && (
              <Button size="sm" variant="outline" onClick={handleEditClick}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canDeletePosts && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('ws-user-groups.delete_post_confirmation_title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('ws-user-groups.delete_post_confirmation_description')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t('ws-user-groups.delete_cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteClick}>
                      {t('ws-user-groups.delete_continue')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>
      {post.post_approval_status === 'REJECTED' && post.rejection_reason && (
        <div className="rounded-md border border-dynamic-red/20 bg-dynamic-red/5 px-3 py-2 text-start">
          <p className="font-medium text-dynamic-red text-xs">
            {t('ws-user-groups.rejection_reason')}
          </p>
          <p className="mt-0.5 text-dynamic-red/80 text-xs">
            {post.rejection_reason}
          </p>
        </div>
      )}
      {configs.showContent && post.content && (
        <div className="whitespace-pre-line text-start text-sm opacity-70">
          {post.content}
        </div>
      )}
      {configs.showStatus && groupId && post.id && (
        <PostEmailStatus wsId={wsId} groupId={groupId} postId={post.id} />
      )}
    </div>
  );
});
