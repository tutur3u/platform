import { BookPlus, ChevronDown, Loader2, Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import { PostDialog } from './post-dialog';
import { PostItem } from './post-item';
import {
  type UserGroupPost,
  useDeletePostMutation,
  usePostConfigs,
  usePostDialog,
  useUpsertPostMutation,
} from './use-posts';

interface UserGroupPostsProps {
  wsId: string;
  groupId?: string;
  selectedPostId?: string;
  posts: UserGroupPost[];
  count?: number | null;
  onClick?: (id: string) => void;
  canUpdatePosts: boolean;
  canCreatePosts: boolean;
  canDeletePosts: boolean;
  canViewPosts?: boolean;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  loadMoreRef?: RefObject<HTMLDivElement | null>;
}

export default function UserGroupPosts({
  wsId,
  groupId,
  selectedPostId,
  posts,
  count,
  onClick,
  canUpdatePosts,
  canCreatePosts,
  canDeletePosts,
  canViewPosts = false,
  isLoading = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  onLoadMore,
  loadMoreRef,
}: UserGroupPostsProps) {
  const t = useTranslations();

  // Use extracted hooks
  const { configs, setShowContent, setShowStatus } = usePostConfigs();
  const {
    isOpen,
    post: currentPost,
    openDialog,
    closeDialog,
    updateField,
  } = usePostDialog();

  const upsertPostMutation = useUpsertPostMutation(groupId, wsId);
  const deletePostMutation = useDeletePostMutation(groupId, wsId);

  const handleSubmit = () => {
    if (!currentPost || !groupId) return;
    upsertPostMutation.mutate(currentPost, {
      onSuccess: closeDialog,
    });
  };

  const handleDelete = (postId: string) => {
    if (!groupId) return;
    deletePostMutation.mutate(postId);
  };

  return (
    <>
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="font-semibold text-xl">
          {t('ws-user-groups.posts')}
          {!!count && ` (${count})`}
        </div>
        <div className="flex items-center gap-2">
          {groupId && canCreatePosts && (
            <Button onClick={() => openDialog()}>
              <BookPlus className="mr-1 h-5 w-5" />
              {t('ws-user-groups.add_post')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                className="flex items-center"
                id="show-post-content"
                checked={configs.showContent}
                onCheckedChange={(checked) => setShowContent(Boolean(checked))}
              >
                <Label
                  htmlFor="show-post-content"
                  className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t('ws-user-groups.show_post_content')}
                </Label>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                className="flex items-center"
                id="show-post-status"
                checked={configs.showStatus}
                onCheckedChange={(checked) => setShowStatus(Boolean(checked))}
              >
                <Label
                  htmlFor="show-post-status"
                  className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t('ws-user-groups.show_post_status')}
                </Label>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Separator className="mt-4 w-full" />
      {canViewPosts && (
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto py-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center gap-3 py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-muted-foreground text-sm">
                {t('common.loading')}...
              </span>
            </div>
          )}

          <PostDialog
            isOpen={isOpen}
            post={currentPost}
            onClose={closeDialog}
            onFieldChange={updateField}
            onSubmit={handleSubmit}
            isSubmitting={upsertPostMutation.isPending}
          />

          {posts.length > 0
            ? posts.map((post) => (
                <PostItem
                  key={post.id}
                  post={post}
                  wsId={wsId}
                  groupId={groupId}
                  selectedPostId={selectedPostId}
                  onClick={onClick}
                  canUpdatePosts={canUpdatePosts}
                  canDeletePosts={canDeletePosts}
                  configs={configs}
                  onEdit={openDialog}
                  onDelete={handleDelete}
                />
              ))
            : !isLoading && (
                <div className="text-center text-sm opacity-50">
                  {t('ws-user-groups.no_posts_to_show')}
                </div>
              )}

          {/* Auto-load trigger for infinite scroll */}
          <div ref={loadMoreRef} className="py-4">
            {isFetchingNextPage && (
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {hasNextPage && !isFetchingNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => onLoadMore?.()}
                  className="w-full transition-all hover:scale-105 md:w-auto"
                >
                  <ChevronDown className="mr-2 h-4 w-4" />
                  {t('common.load_more')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export type { UserGroupPost };
