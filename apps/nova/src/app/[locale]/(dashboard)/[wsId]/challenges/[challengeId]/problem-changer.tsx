import { Button } from '@repo/ui/components/ui/button';
import React from 'react';

export default function ProblemChanger() {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm">
        {'<'}
      </Button>
      <div className="text-sm text-black">1 of 12</div>
      <Button variant="outline" size="sm">
        {'>'}
      </Button>
    </div>
  );
}
