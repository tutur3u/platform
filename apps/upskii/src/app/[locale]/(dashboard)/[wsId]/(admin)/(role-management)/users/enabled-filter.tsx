'use client';

import { Filter } from '@tuturuuu/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface EnabledFilterProps {
  currentEnabled?: string;
}

export default function EnabledFilter({ currentEnabled }: EnabledFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleEnabledChange = (value: string) => {
    // Create a new URLSearchParams object
    const params = new URLSearchParams(searchParams.toString());

    // Update or remove the enabled parameter
    if (value === 'all') {
      params.delete('enabled');
    } else {
      params.set('enabled', value);
    }

    // Preserve the page parameter if it exists
    if (params.has('page')) {
      params.set('page', '1'); // Reset to page 1 when filter changes
    }

    // Create the new URL
    const newUrl = `${pathname}?${params.toString()}`;

    // Navigate to the new URL
    router.push(newUrl);
  };

  return (
    <div className="flex items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">Status:</span>
      <Select
        defaultValue={currentEnabled || 'all'}
        onValueChange={handleEnabledChange}
      >
        <SelectTrigger className="h-8 w-[180px]">
          <SelectValue placeholder="All users" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All users</SelectItem>
          <SelectItem value="true">Enabled</SelectItem>
          <SelectItem value="false">Disabled</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
