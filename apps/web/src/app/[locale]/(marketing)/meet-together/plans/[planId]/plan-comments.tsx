'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useEffect, useState } from 'react';

// Replace with your UI if different

interface PlanComment {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface PlanCommentsProps {
  planId: string;
  userType: 'PLATFORM' | 'GUEST' | 'DISPLAY';
  currentUserName: string; // Pre-fill for guests or platform user display name
  guestId?: string | null; // For GUEST
}

export default function PlanComments({
  planId,
  userType,
  currentUserName,
  guestId,
}: PlanCommentsProps) {
  const [comments, setComments] = useState<PlanComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState(currentUserName ?? '');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch comments
  useEffect(() => {
    setLoading(true);
    fetch(`/api/meet-together/plans/${planId}/comments`)
      .then((res) => res.json())
      .then((data) => setComments(data))
      .finally(() => setLoading(false));
  }, [planId]);

  // Submit new comment
  const handleSubmit = async () => {
    if (!authorName.trim() || !content.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/meet-together/plans/${planId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        author_name: authorName,
        content,
        userType,
        guestId,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    setSubmitting(false);
    if (res.ok) {
      const newComment = await res.json();
      setComments((prev) => [...prev, newComment]);
      setContent('');
    }
  };

  return (
    <div className="mt-10 space-y-6">
      <h3 className="text-lg font-semibold text-dynamic-purple">Comments</h3>
      {loading ? (
        <div className="text-foreground/50">Loading comments...</div>
      ) : (
        <div className="space-y-4">
          {comments.length === 0 && (
            <div className="text-foreground/60">No comments yet.</div>
          )}
          {comments.map((c) => (
            <div
              key={c.id}
              className="rounded-lg bg-dynamic-light-purple/60 px-4 py-2"
            >
              <div className="font-medium text-dynamic-purple">
                {c.author_name}
              </div>
              <div className="text-foreground">{c.content}</div>
              <div className="text-xs text-foreground/50">
                {new Date(c.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
      {userType !== 'DISPLAY' && (
        <div className="space-y-2 rounded-lg border bg-dynamic-light-purple/30 p-4">
          <Input
            placeholder="Your name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="mb-2"
            disabled={userType === 'PLATFORM'} // Platform users don't edit name
            readOnly={userType === 'PLATFORM'}
          />
          <Textarea
            placeholder="Write a comment..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="mb-2"
            disabled={submitting}
          />
          <Button
            onClick={handleSubmit}
            className="bg-dynamic-purple text-background"
            disabled={!authorName.trim() || !content.trim() || submitting}
          >
            Post Comment
          </Button>
        </div>
      )}
    </div>
  );
}
