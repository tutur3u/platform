import React from 'react';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../../../packages/ui/src/components/ui/dropdown-menu'; // Adjust the import path

interface Props {
  users: WorkspaceUser[]; // Accept an array of WorkspaceUser objects
}

const UserList: React.FC<Props> = ({ users }) => {
    console.log("user in userList"+ users);
  return (
    <div>
      {users.map((user) => (
        <div key={user.id} className="mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 bg-gray-200 rounded">
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
