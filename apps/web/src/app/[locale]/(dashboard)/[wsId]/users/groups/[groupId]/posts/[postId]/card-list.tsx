'use client'
import React from "react";
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import UserCard from "./card";

interface Props {
  users: WorkspaceUser[];
  wsId: string;
  postId: string;
  groupId: string;
}

export default function CardList({ users,wsId,postId, groupId }: Props) {
  return (
    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {users.map((user) => (
        <UserCard key={user.id} user={user} wsId={wsId} postId={postId} groupId={groupId} />
      ))}
    </div>
  );
}
