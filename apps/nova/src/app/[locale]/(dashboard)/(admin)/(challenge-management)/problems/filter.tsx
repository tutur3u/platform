'use client';

import { Button } from '@tuturuuu/ui/button';
import { Filter } from '@tuturuuu/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

interface Challenge {
  id: string;
  title: string;
}

interface ChallengeFilterProps {
  challenges: Challenge[];
  initialChallengeId?: string;
  label?: string;
}

export default function ChallengeFilter({
  challenges,
  initialChallengeId,
  label = 'Filter by Challenge',
}: ChallengeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedChallengeId, setSelectedChallengeId] = useState(
    initialChallengeId || ''
  );

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(name, value);
      } else {
        params.delete(name);
      }

      // Reset to page 1 when filter changes
      params.set('page', '1');

      return params.toString();
    },
    [searchParams]
  );

  const handleValueChange = (value: string) => {
    setSelectedChallengeId(value);

    // Update the URL with the new filter
    const queryString = createQueryString('challengeId', value);
    router.push(`${pathname}?${queryString}`);
  };

  const handleClear = () => {
    setSelectedChallengeId('');

    // Clear the filter from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete('challengeId');
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Filter className="h-4 w-4" />
        <span>{label}:</span>
      </div>

      <Select value={selectedChallengeId} onValueChange={handleValueChange}>
        <SelectTrigger className="w-[240px]">
          <SelectValue placeholder="All Challenges" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Challenges</SelectItem>
          {challenges.map((challenge) => (
            <SelectItem key={challenge.id} value={challenge.id}>
              {challenge.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedChallengeId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-8 px-2"
        >
          Clear
        </Button>
      )}
    </div>
  );
}
