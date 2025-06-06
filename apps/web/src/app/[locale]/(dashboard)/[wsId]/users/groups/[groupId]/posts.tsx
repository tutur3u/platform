import { PostEmailStatus } from './post';
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
} from '@ncthub/ui/alert-dialog';
import { Button } from '@ncthub/ui/button';
import { Checkbox } from '@ncthub/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ncthub/ui/dialog';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { BookPlus, Clock, Eye, Pencil, Trash2 } from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import { Label } from '@ncthub/ui/label';
import { Separator } from '@ncthub/ui/separator';
import { Textarea } from '@ncthub/ui/textarea';
import { cn } from '@ncthub/utils/format';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
}: {
  wsId: string;
  groupId?: string;
  selectedPostId?: string;
  posts: UserGroupPost[];
  count?: number | null;
  onClick?: (id: string) => void;
}) {
  const t = useTranslations();
  const router = useRouter();

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

  const submitPost = async () => {
    if (!currentPost || !groupId) return;

    const method = currentPost.id ? 'PUT' : 'POST';
    const url = `/api/v1/workspaces/${wsId}/user-groups/${groupId}/posts${currentPost.id ? `/${currentPost.id}` : ''}`;

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(currentPost),
    });

    if (res.ok) {
      handleCloseDialog();
      router.refresh();
    } else {
      toast({
        title: 'Error',
        content: 'An error occurred while saving the post.',
      });
    }
  };

  const deletePost = async (postId: string) => {
    if (!groupId) return;

    const res = await fetch(
      `/api/v1/workspaces/${wsId}/user-groups/${groupId}/posts/${postId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      handleCloseDialog();
      router.refresh();
    } else {
      toast({
        title: 'Error',
        content: 'An error occurred while deleting the post.',
      });
    }
  };

  return (
    <>
      <div className="flex items-start justify-between">
        <div className="grid gap-1">
          <div className="mb-2 text-xl font-semibold">
            {t('ws-user-groups.posts')}
            {!!count && ` (${count})`}
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-post-content"
              checked={configs.showContent}
              onCheckedChange={(checked) =>
                setConfigs((prev) => ({
                  ...prev,
                  showContent: Boolean(checked),
                }))
              }
            />
            <label
              htmlFor="show-post-content"
              className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t('ws-user-groups.show_post_content')}
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-post-status"
              checked={configs.showStatus}
              onCheckedChange={(checked) =>
                setConfigs((prev) => ({
                  ...prev,
                  showStatus: Boolean(checked),
                }))
              }
            />
            <label
              htmlFor="show-post-status"
              className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t('ws-user-groups.show_post_status')}
            </label>
          </div>
        </div>
        {groupId && (
          <Button onClick={() => handleOpenDialog()}>
            <BookPlus className="mr-1 h-5 w-5" />
            {t('ws-user-groups.add_post')}
          </Button>
        )}
      </div>
      <Separator className="mt-4 w-full" />
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto py-4">
        <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
          <DialogContent className="sm:max-w-[425px]">
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
                  placeholder='e.g. "Meeting Notes"'
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
                  placeholder='e.g. "Today we discussed the upcoming event."'
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
                  placeholder='e.g. "Remember to follow up with the team."'
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
              className={cn(
                'flex flex-col gap-2 rounded border p-2 transition duration-300 hover:border-foreground hover:bg-foreground/5',
                selectedPostId === post.id &&
                  'border-foreground bg-foreground/5',
                groupId || 'cursor-pointer'
              )}
              onClick={() => post.id && onClick && onClick(post.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">{post.title}</div>
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {post?.group_name && (
                      <div className="flex w-fit items-center gap-0.5 rounded bg-foreground px-2 py-1 text-xs text-background">
                        {post?.group_name}
                      </div>
                    )}
                    {post.created_at && (
                      <div className="flex items-center gap-0.5 text-xs opacity-70">
                        <Clock className="h-3 w-3" />
                        {format(new Date(post.created_at), 'HH:mm, dd/MM/yyyy')}
                      </div>
                    )}
                  </div>
                </div>
                {groupId && (
                  <div className="flex gap-2">
                    <Link
                      href={
                        groupId
                          ? `/${wsId}/users/groups/${groupId}/posts/${post.id}`
                          : '#'
                      }
                    >
                      <Button size="sm" variant="outline">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenDialog(post)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Are you absolutely sure?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete your account and remove your data from our
                            servers.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => post.id && deletePost(post.id)}
                          >
                            Continue
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
              {configs.showContent && post.content && (
                <div className="text-sm whitespace-pre-line opacity-70">
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
            No posts to show.
          </div>
        )}
      </div>
    </>
  );
}
