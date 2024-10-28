'use client';

import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import React, { useState } from 'react';

export default function ColumnCreation({ wsId, boardId }: { wsId: string, boardId: string }) {
  // State to manage column title input
  const [title, setTitle] = useState('');

  // Function to create a new column
  async function createNewColumn() {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-boards/column/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            boardId: boardId,  
            title: title,      
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error creating column:', errorData);
      } else {
        console.log('Column created successfully.');
        // Optionally, clear the input after creating the column
        setTitle('');
      }
    } catch (error) {
      console.error('Error creating column:', error);
    }
  }

  return (
    <div>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Create new column</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create new column</DialogTitle>
            <DialogDescription>
              Create a new column to start managing your tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Input for the column title */}
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}  
              placeholder="Enter column title"
            />
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              onClick={createNewColumn} 
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
