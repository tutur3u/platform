import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import React from 'react';

interface Props {
  users: WorkspaceUser[];
}

const UserList: React.FC<Props> = ({ users }) => {
  console.log('user in userList' + users);
  return (
    <div>
      {users.map((user) => (
        <div key={user.id} className="mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded bg-gray-200 p-2">
                {user.full_name || 'Unnamed User'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <strong>Name:</strong> {user.full_name}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <strong>Email:</strong> {user.email}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <strong>Phone:</strong> {user.phone}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <strong>Gender:</strong> {user.gender}
              </DropdownMenuItem>
              {/* Add more items as needed */}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
};

export default UserList;
