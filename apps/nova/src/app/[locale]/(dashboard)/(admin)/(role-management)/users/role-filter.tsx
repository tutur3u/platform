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

interface RoleFilterProps {
  currentRole?: string;
}

export default function RoleFilter({ currentRole }: RoleFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleRoleChange = (value: string) => {
    // Create a new URLSearchParams object
    const params = new URLSearchParams(searchParams.toString());

    // Update or remove the role parameter
    if (value === 'all') {
      params.delete('role');
    } else {
      params.set('role', value);
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
      <span className="text-sm font-medium">Role:</span>
      <Select
        defaultValue={currentRole || 'all'}
        onValueChange={handleRoleChange}
      >
        <SelectTrigger className="h-8 w-[180px]">
          <SelectValue placeholder="All roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="global_manager">Global Manager</SelectItem>
          <SelectItem value="challenge_manager">Challenge Manager</SelectItem>
          <SelectItem value="member">Member</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
