import { Button } from '@tuturuuu/ui/button';
import { PlusIcon } from '@tuturuuu/ui/icons';
import React, { useEffect, useState } from 'react';

interface AddEventButtonProps {
  wsId: string;
  onOpenDialog?: () => void;
}

export default function AddEventButton({
  wsId,
  onOpenDialog,
}: AddEventButtonProps) {
  return (
    <Button
      onClick={onOpenDialog}
      variant="default"
      size="sm"
      className="w-full bg-blue-500 text-white hover:bg-blue-600 md:w-fit"
    >
      <PlusIcon className="mr-2 h-4 w-4" />
      Add Event
    </Button>
  );
}
