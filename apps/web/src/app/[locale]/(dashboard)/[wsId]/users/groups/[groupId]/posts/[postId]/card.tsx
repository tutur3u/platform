import React, { useState } from 'react';
import { Card } from "@repo/ui/components/ui/card";
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
interface Props {
  user: WorkspaceUser;
}

interface ButtonState {
  isClicked: boolean;
  saveType: string; 
}

function UserCard({ user }: Props) {
  const [buttonState, setButtonState] = useState<ButtonState>({
    isClicked: false,
    saveType: '',
  });

  function handleClick(saveType: string) {
    setButtonState({
      isClicked: true,
      saveType: saveType,
    });
  }

  return (
    <Card className=" rounded-lg shadow-md p-4 w-full max-w-lg">
      <div className="flex items-center">
        <img
          src="user_image_url"
          alt="User avatar"
          className="w-12 h-12 rounded-full object-cover"
        />
        <div className="ml-4 w-full">
          <h3 className="text-white text-lg font-semibold">
            {user.full_name}
          </h3>
          <p className="text-gray-400 text-sm">{user.phone}</p>
          <Input
            placeholder="Notes"
            className="mt-2 w-full h-24 border border-gray-700 rounded-md p-2 text-white placeholder-gray-500 resize-none"
          />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        {buttonState.isClicked && (
          <Button className="mr-2">
            Save
          </Button>
        )}
        <Button
          onClick={() => handleClick('reject')}
          className="px-4 py-1 mr-2 text-white bg-red-500 rounded-md hover:bg-red-600"
        >
          Reject
        </Button>
        <Button
          onClick={() => handleClick('approve')}
          className="px-4 py-1 text-white bg-green-500 rounded-md hover:bg-green-600"
        >
          Approve
        </Button>
      </div>
    </Card>
  );
}

export default UserCard;
