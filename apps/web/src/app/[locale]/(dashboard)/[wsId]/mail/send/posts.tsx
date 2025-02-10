'use client';

import UserGroupPosts, {
  UserGroupPost,
} from '../../users/groups/[groupId]/posts';
import { createClient } from '@tutur3u/supabase/next/client';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MailPosts({
  wsId,
  emails,
}: {
  wsId: string;
  emails: string[];
}) {
  const searchParams = useSearchParams();
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<UserGroupPost[]>([]);

  useEffect(() => {
    const getPosts = async () => {
      const groupIds = searchParams.getAll('includedGroups');
      const { data } = await getGroupPosts(groupIds);
      setSelectedPostId(null);
      setPosts(data);
    };

    getPosts();
  }, [wsId, searchParams]);

  const selectedPost = posts.find((post) => post.id === selectedPostId);

  return (
    <>
      <div className="border-border bg-foreground/5 grid rounded-lg border p-4 pb-0">
        <UserGroupPosts
          wsId={wsId}
          selectedPostId={selectedPostId || undefined}
          posts={posts}
          onClick={(id) => setSelectedPostId(id)}
        />
      </div>

      <Separator className="my-4" />
      <div>
        <div className="text-xl font-semibold">Destination Emails</div>
        <div>
          {emails.map((email, idx) => (
            <div key={email} className="font-semibold">
              {idx + 1}. <span className="underline">{email}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedPost?.id && (
        <>
          <Separator className="my-4" />
          <div className="border-border bg-foreground/5 mb-4 grid rounded-lg border p-4">
            <div>
              <div className="text-xl font-semibold">Selected Post</div>
              <div>
                <span className="font-semibold">Group Name:</span>{' '}
                {selectedPost.group_name}
              </div>
            </div>
            {selectedPost.title && (
              <div>
                <span className="font-semibold">Title:</span>{' '}
                {selectedPost.title}
              </div>
            )}
            {selectedPost.content && (
              <div>
                <span className="font-semibold">Content:</span>{' '}
                {selectedPost.content}
              </div>
            )}
            {selectedPost.notes && (
              <div>
                <span className="font-semibold">Notes:</span>{' '}
                {selectedPost.notes}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

async function getGroupPosts(groupIds: string[]) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('user_group_posts')
    .select('*, ...workspace_user_groups(group_name:name)', {
      count: 'exact',
    })
    .in('group_id', groupIds)
    .order('created_at', { ascending: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}
