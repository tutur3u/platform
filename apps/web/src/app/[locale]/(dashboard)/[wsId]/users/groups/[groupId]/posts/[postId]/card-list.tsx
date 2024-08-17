'use client';

import UserCard, { UserGroupPost } from './card';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';

interface Props {
  users: WorkspaceUser[];
  wsId: string;
  post: UserGroupPost;
}

export default function CardList({ users, wsId, post }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {users.map((user) => (
        <UserCard key={user.id} user={user} wsId={wsId} post={post} />
      ))}
    </div>
  );
}
