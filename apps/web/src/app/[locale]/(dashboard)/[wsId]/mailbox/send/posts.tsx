'use client';

import UserGroupPosts, {
  UserGroupPost,
} from '../../users/groups/[groupId]/posts';
import { PostEmailForm } from './form';
import { createClient } from '@/utils/supabase/client';
import { Separator } from '@repo/ui/components/ui/separator';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MailboxPosts({
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
          posts={posts}
          onClick={(id) => setSelectedPostId(id)}
        />
      </div>

      <Separator className="my-4" />
      <div>
        <div className="text-2xl font-semibold">Destination Emails</div>
        <div>
          {emails.map((email) => (
            <div key={email}>{email}</div>
          ))}
        </div>
      </div>

      {selectedPost?.id && (
        <>
          <Separator className="my-4" />
          <div className="mb-4">
            <div>
              <div className="text-2xl font-semibold">Selected Post</div>
              <div>Group Name: {selectedPost.group_name}</div>
            </div>
            <div>Title: {selectedPost.title}</div>
            <div>Content: {selectedPost.content}</div>
            <div>Notes: {selectedPost.notes}</div>
          </div>
          <PostEmailForm post={selectedPost} />
        </>
      )}
    </>
  );
}

async function getGroupPosts(groupIds: string[]) {
  const supabase = createClient();

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
