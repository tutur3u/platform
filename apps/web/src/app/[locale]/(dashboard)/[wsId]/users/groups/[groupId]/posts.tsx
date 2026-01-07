import {
  BookPlus,
  Clock,
  Eye,
  Pencil,
  Settings,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PostEmailStatus } from './post';

export interface UserGroupPost {
  id?: string;
  group_name?: string;
  title: string | null;
  content: string | null;
  notes: string | null;
  created_at?: string;
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
}: {
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
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPost, setCurrentPost] = useState<UserGroupPost | undefined>();

  const [configs, setConfigs] = useState({
    showContent: true,
    showStatus: true,
  });

  const handleOpenDialog = (post?: UserGroupPost) => {
    setCurrentPost(
      post || {
        title: '',
        content: '',
        notes: '',
      }
    );
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setCurrentPost(undefined);
    setIsDialogOpen(false);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (currentPost) {
      setCurrentPost({ ...currentPost, [e.target.name]: e.target.value });
    }
  };

  const upsertPostMutation = useMutation({
    mutationFn: async (post: UserGroupPost) => {
      if (!groupId) throw new Error('Missing groupId');
      const supabase = createClient();
      const payload = {
        title: post.title,
        content: post.content,
        notes: post.notes,
        group_id: groupId,
      };

      if (post.id) {
        const { error } = await supabase
          .from('user_group_posts')
          .update(payload)
          .eq('id', post.id)
          .eq('group_id', groupId);
        if (error) throw error;
        return { kind: 'update' as const };
      }

      const { error } = await supabase.from('user_group_posts').insert(payload);
      if (error) throw error;
      return { kind: 'create' as const };
    },
    onSuccess: () => {
      handleCloseDialog();
      queryClient.invalidateQueries({
        queryKey: ['group-posts', wsId, groupId],
      });
      toast.success(t('common.saved'));
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!groupId) throw new Error('Missing groupId');
      const supabase = createClient();
      const { error } = await supabase
        .from('user_group_posts')
        .delete()
        .eq('id', postId)
        .eq('group_id', groupId);
      if (error) throw error;
      return { postId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['group-posts', wsId, groupId],
      });
      toast.success(t('common.deleted'));
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
  });

  const submitPost = async () => {
    if (!currentPost || !groupId) return;
    await upsertPostMutation.mutateAsync(currentPost);
  };

  const deletePost = async (postId: string) => {
    if (!groupId) return;
    await deletePostMutation.mutateAsync(postId);
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
            <Button onClick={() => handleOpenDialog()}>
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
                onCheckedChange={(checked) =>
                  setConfigs((prev) => ({
                    ...prev,
                    showContent: Boolean(checked),
                  }))
                }
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
                onCheckedChange={(checked) =>
                  setConfigs((prev) => ({
                    ...prev,
                    showStatus: Boolean(checked),
                  }))
                }
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
          <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
            <DialogContent className="sm:max-w-106.25">
              <DialogHeader>
                <DialogTitle>
                  {currentPost?.id
                    ? t('ws-user-groups.edit_post')
                    : t('ws-user-groups.add_post')}
                </DialogTitle>
                <DialogDescription>
                  {currentPost?.id
                    ? t('ws-user-groups.edit_post_description')
                    : t('ws-user-groups.add_post_description')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid items-center gap-2">
                  <Label htmlFor="title">
                    {t('post-email-data-table.post_title')}
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder={t(
                      'post-email-data-table.post_title_placeholder'
                    )}
                    value={currentPost?.title || ''}
                    onChange={handleInputChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid items-center gap-2">
                  <Label htmlFor="content">
                    {t('post-email-data-table.post_content')}
                  </Label>
                  <Textarea
                    id="content"
                    name="content"
                    placeholder={t(
                      'post-email-data-table.post_content_placeholder'
                    )}
                    value={currentPost?.content || ''}
                    onChange={handleInputChange}
                    className="col-span-3"
                  />
                </div>
                <div className="grid items-center gap-2">
                  <Label htmlFor="created_at">
                    {t('post-email-data-table.notes')}
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder={t('post-email-data-table.notes_placeholder')}
                    value={currentPost?.notes || ''}
                    onChange={handleInputChange}
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" onClick={submitPost}>
                  {currentPost?.id ? t('common.save') : t('common.create')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {posts.length > 0 ? (
            posts.map((post) => (
              <div
                key={post.id}
                role={onClick ? 'button' : undefined}
                tabIndex={onClick ? 0 : -1}
                className={cn(
                  'flex flex-col gap-2 rounded border p-2 transition duration-300 hover:border-foreground hover:bg-foreground/5',
                  selectedPostId === post.id &&
                    'border-foreground bg-foreground/5',
                  onClick ? 'cursor-pointer' : ''
                )}
                onClick={() => post.id && onClick && onClick(post.id)}
                onKeyDown={(e) => {
                  if (!onClick) return;
                  if ((e.key === 'Enter' || e.key === ' ') && post.id) {
                    e.preventDefault();
                    onClick(post.id);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-left font-semibold text-sm">
                      {post.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {post?.group_name && (
                        <div className="flex w-fit items-center gap-0.5 rounded bg-foreground px-2 py-1 text-background text-xs">
                          {post?.group_name}
                        </div>
                      )}
                      {post.created_at && (
                        <div className="flex items-center gap-0.5 text-xs opacity-70">
                          <Clock className="h-3 w-3" />
                          {format(
                            new Date(post.created_at),
                            'HH:mm, dd/MM/yyyy'
                          )}
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDialog(post);
                          }}
                        >
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
                                {t(
                                  'ws-user-groups.delete_post_confirmation_title'
                                )}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t(
                                  'ws-user-groups.delete_post_confirmation_description'
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t('ws-user-groups.delete_cancel')}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => post.id && deletePost(post.id)}
                              >
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
            ))
          ) : (
            <div className="text-center text-sm opacity-50">
              {t('ws-user-groups.no_posts_to_show')}
            </div>
          )}
        </div>
      )}
    </>
  );
}
