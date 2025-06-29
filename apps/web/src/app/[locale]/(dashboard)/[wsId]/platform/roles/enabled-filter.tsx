'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Activity, Ban, Check, Filter } from '@tuturuuu/ui/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface EnabledFilterProps {
  currentEnabled?: string;
}

export default function EnabledFilter({ currentEnabled }: EnabledFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const _t = useTranslations();

  const updateFilter = (enabled?: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (enabled) {
      params.set('enabled', enabled);
    } else {
      params.delete('enabled');
    }

    // Reset to first page when changing filters
    params.delete('page');

    router.push(`?${params.toString()}`);
  };

  const getFilterLabel = () => {
    if (currentEnabled === 'true') return 'Enabled Only';
    if (currentEnabled === 'false') return 'Disabled Only';
    return 'All Status';
  };

  const getFilterIcon = () => {
    if (currentEnabled === 'true')
      return <Activity className="h-4 w-4 text-dynamic-green" />;
    if (currentEnabled === 'false')
      return <Ban className="h-4 w-4 text-dynamic-red" />;
    return <Filter className="h-4 w-4" />;
  };

  const getFilterVariant = () => {
    return currentEnabled ? 'default' : 'outline';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={getFilterVariant()}
          className="flex items-center gap-2 min-w-[120px]"
        >
          {getFilterIcon()}
          {getFilterLabel()}
          {currentEnabled && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 w-5 rounded-full p-0 text-xs"
            >
              1
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem
          onClick={() => updateFilter()}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            All Status
          </div>
          {!currentEnabled && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => updateFilter('true')}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-dynamic-green" />
            Enabled Only
          </div>
          {currentEnabled === 'true' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => updateFilter('false')}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-dynamic-red" />
            Disabled Only
          </div>
          {currentEnabled === 'false' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
