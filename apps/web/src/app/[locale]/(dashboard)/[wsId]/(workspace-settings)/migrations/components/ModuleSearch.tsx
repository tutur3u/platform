import { ModulePackage } from '../modules';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@repo/ui/components/ui/sheet';
import { Switch } from '@repo/ui/components/ui/switch';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ModuleSearchProps {
  modules: ModulePackage[];
  onFilterChange: (modules: ModulePackage[]) => void;
}

type SortOption = 'name' | 'status' | 'items';
type FilterOption = 'all' | 'active' | 'disabled' | 'skipped';

type FilterState = {
  searchQuery: string;
  sortBy: SortOption;
  filterBy: FilterOption;
  showDisabled: boolean;
  showSkipped: boolean;
  showEmpty: boolean;
};

export function ModuleSearch({ modules, onFilterChange }: ModuleSearchProps) {
  const [filterState, setFilterState] = useState<FilterState>({
    searchQuery: '',
    sortBy: 'name',
    filterBy: 'all',
    showDisabled: true,
    showSkipped: true,
    showEmpty: true,
  });

  const updateFilter = useCallback((updates: Partial<FilterState>) => {
    setFilterState((prev) => ({ ...prev, ...updates }));
  }, []);

  const filteredModules = useMemo(() => {
    let result = [...modules];

    // Apply search
    if (filterState.searchQuery) {
      const query = filterState.searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.module.toLowerCase().includes(query) ||
          m.externalPath.toLowerCase().includes(query)
      );
    }

    // Apply filters
    switch (filterState.filterBy) {
      case 'active':
        result = result.filter((m) => !m.disabled && !m.skip);
        break;
      case 'disabled':
        result = result.filter((m) => m.disabled);
        break;
      case 'skipped':
        result = result.filter((m) => m.skip);
        break;
    }

    if (!filterState.showDisabled) {
      result = result.filter((m) => !m.disabled);
    }

    if (!filterState.showSkipped) {
      result = result.filter((m) => !m.skip);
    }

    // Note: We don't filter by empty data here since it's dynamic
    // and will be handled by the parent component

    // Apply sorting
    result.sort((a, b) => {
      switch (filterState.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'status':
          const aStatus = a.disabled ? 2 : a.skip ? 1 : 0;
          const bStatus = b.disabled ? 2 : b.skip ? 1 : 0;
          return aStatus - bStatus;
        case 'items':
          // We don't sort by items since it's dynamic data
          // Just maintain the current order
          return 0;
        default:
          return 0;
      }
    });

    return result;
  }, [modules, filterState]);

  useEffect(() => {
    onFilterChange(filteredModules);
  }, [filteredModules, onFilterChange]);

  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
        <Input
          placeholder="Search modules..."
          value={filterState.searchQuery}
          onChange={(e) => updateFilter({ searchQuery: e.target.value })}
          className="pl-8"
        />
      </div>

      <Select
        value={filterState.sortBy}
        onValueChange={(v) => updateFilter({ sortBy: v as SortOption })}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Sort by name</SelectItem>
          <SelectItem value="status">Sort by status</SelectItem>
          <SelectItem value="items">Sort by items</SelectItem>
        </SelectContent>
      </Select>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filter Modules</SheetTitle>
            <SheetDescription>
              Configure which modules to display and how to filter them.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label>Filter by status</Label>
              <Select
                value={filterState.filterBy}
                onValueChange={(v) =>
                  updateFilter({ filterBy: v as FilterOption })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Show all</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="disabled">Disabled only</SelectItem>
                  <SelectItem value="skipped">Skipped only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-disabled">Show disabled modules</Label>
                <Switch
                  id="show-disabled"
                  checked={filterState.showDisabled}
                  onCheckedChange={(checked) =>
                    updateFilter({ showDisabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-skipped">Show skipped modules</Label>
                <Switch
                  id="show-skipped"
                  checked={filterState.showSkipped}
                  onCheckedChange={(checked) =>
                    updateFilter({ showSkipped: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-empty">Show empty modules</Label>
                <Switch
                  id="show-empty"
                  checked={filterState.showEmpty}
                  onCheckedChange={(checked) =>
                    updateFilter({ showEmpty: checked })
                  }
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
