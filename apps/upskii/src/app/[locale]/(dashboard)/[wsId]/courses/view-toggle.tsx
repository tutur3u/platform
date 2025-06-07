'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Grid3X3, Table } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface ViewToggleProps {
  currentView: 'card' | 'table';
}

export function ViewToggle({ currentView }: ViewToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleViewChange = useCallback(
    (view: 'card' | 'table') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', view);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {currentView === 'card' ? (
            <>
              <Grid3X3 className="mr-2 h-4 w-4" />
              Card View
            </>
          ) : (
            <>
              <Table className="mr-2 h-4 w-4" />
              Table View
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleViewChange('card')}>
          <Grid3X3 className="mr-2 h-4 w-4" />
          Card View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewChange('table')}>
          <Table className="mr-2 h-4 w-4" />
          Table View
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
