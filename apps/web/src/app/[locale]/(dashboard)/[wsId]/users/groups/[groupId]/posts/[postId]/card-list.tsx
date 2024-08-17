'use client'
import React from "react";
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import UserCard from "./card";

export interface UserGroupPost {
  id?: string;
  ws_id?:string;
  name?: string;
  created_at?: string;
  archived?: string;
  ending_data?: string;
  notes?: string;
  sessions?: string;
  starting_data?: string;
}
interface Props {
  users: WorkspaceUser[];
  wsId: string;
  group: UserGroupPost;
  postId: string;
  groupId: string;
}

export default function CardList({ users,wsId, group,postId, groupId }: Props) {
  return (
    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {users.map((user) => (
        <UserCard key={user.id} user={user} wsId={wsId} group={group} postId={postId} groupId={groupId} />
      ))}
    </div>
  );
}
