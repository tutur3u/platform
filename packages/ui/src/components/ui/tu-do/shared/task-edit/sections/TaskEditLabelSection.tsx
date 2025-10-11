import { Check, Loader2, Plus, Search, Tag, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { memo, useMemo, useState } from 'react';

interface WorkspaceTaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface TaskEditLabelSectionProps {
  selectedLabels: WorkspaceTaskLabel[];
  availableLabels: WorkspaceTaskLabel[];
  isLoading: boolean;
  onToggleLabel: (label: WorkspaceTaskLabel) => void;
  onCreateNew: () => void;
}

export const TaskEditLabelSection = memo(function TaskEditLabelSection({
  selectedLabels,
  availableLabels,
  isLoading,
  onToggleLabel,
  onCreateNew,
}: TaskEditLabelSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return availableLabels;
    const query = searchQuery.toLowerCase();
    return availableLabels.filter((label) =>
      label.name.toLowerCase().includes(query)
    );
  }, [availableLabels, searchQuery]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 font-medium text-sm">
          <Tag className="h-4 w-4" />
          Labels
        </Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateNew}
          className="h-7 gap-1 text-xs"
        >
          <Plus className="h-3 w-3" />
          Create
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search labels..."
              className="pl-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-7 w-7 p-0"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Selected labels */}
          {selectedLabels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedLabels
                .sort((a, b) =>
                  a.name.toLowerCase().localeCompare(b.name.toLowerCase())
                )
                .map((label) => (
                  <Badge
                    key={label.id}
                    style={{
                      backgroundColor: `color-mix(in srgb, ${label.color} 15%, transparent)`,
                      borderColor: `color-mix(in srgb, ${label.color} 30%, transparent)`,
                      color: label.color,
                    }}
                    className="h-6 cursor-pointer border px-2 text-xs"
                    onClick={() => onToggleLabel(label)}
                  >
                    {label.name}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
            </div>
          )}

          {/* Available labels */}
          <ScrollArea className="h-[200px] rounded-md border">
            <div className="space-y-1 p-2">
              {filteredLabels.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  {searchQuery ? 'No labels found' : 'No labels yet'}
                </div>
              ) : (
                filteredLabels.map((label) => {
                  const isSelected = selectedLabels.some(
                    (l) => l.id === label.id
                  );

                  return (
                    <button
                      type="button"
                      key={label.id}
                      onClick={() => onToggleLabel(label)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      )}
                    >
                      <Badge
                        style={{
                          backgroundColor: `color-mix(in srgb, ${label.color} 15%, transparent)`,
                          borderColor: `color-mix(in srgb, ${label.color} 30%, transparent)`,
                          color: label.color,
                        }}
                        className="border px-2 text-xs"
                      >
                        {label.name}
                      </Badge>
                      <span className="flex-1" />
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
});
