import { Clock, Eye, Pencil, Shield, Trash2 } from '@tuturuuu/icons';
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
            {post.post_approval_status !== 'APPROVED' && (
              <div className="flex w-fit items-center gap-0.5 rounded bg-dynamic-orange px-2 py-1 text-background text-xs">
                <Shield className="h-3 w-3" />
                {t('ws-user-groups.post_needs_approval')}
              </div>
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
      {configs.showContent && post.content && (
        <div className="whitespace-pre-line text-start text-sm opacity-70">
          {post.content}
        </div>
      )}
      {configs.showStatus && groupId && post.id && (
        <PostEmailStatus groupId={groupId} postId={post.id} />
      )}
    </div>
  );
});
