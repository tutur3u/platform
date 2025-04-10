'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Textarea } from '@tuturuuu/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Comment {
  id: string;
  project_id: string;
  content: string;
  created_at: string;
  user_id: string;
  user_name?: string;
  user_avatar_url?: string;
}

interface CommentsProps {
  wsId: string;
  projectId: string;
}

export function Comments({ wsId, projectId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchComments = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/architecture/${projectId}/comments`
      );

      if (response.ok) {
        const data = await response.json();
        setComments(data);
      } else {
        setComments([]);
        // console.error('Failed to fetch comments');
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim()) return;

    try {
      setIsSubmitting(true);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/architecture/${projectId}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: newComment }),
        }
      );

      if (response.ok) {
        setNewComment('');
        fetchComments();
        toast({
          title: 'Comment added',
          description: 'Your comment has been added successfully.',
        });
      } else {
        toast({
          title: 'Failed to add comment',
          description: 'There was an error adding your comment.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments & Notes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading ? (
            <div className="py-4 text-center">
              <p className="text-muted-foreground">Loading comments...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-muted-foreground">
                No comments yet. Be the first to add a note.
              </p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex space-x-4">
                <Avatar>
                  <AvatarImage src={comment.user_avatar_url} />
                  <AvatarFallback>
                    {comment.user_name
                      ? comment.user_name.substring(0, 2).toUpperCase()
                      : 'UN'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {comment.user_name || 'User'}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-sm">{comment.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
      <CardFooter>
        <form onSubmit={handleSubmit} className="w-full">
          <div className="flex space-x-2">
            <Textarea
              placeholder="Add a comment or note about this project..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isSubmitting || !newComment.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardFooter>
    </Card>
  );
}
