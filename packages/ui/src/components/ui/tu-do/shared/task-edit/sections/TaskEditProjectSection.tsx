import { Box, Check, Loader2, Search, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { memo, useMemo, useState } from 'react';

interface TaskProject {
  id: string;
  name: string;
  status: string | null;
}

interface TaskEditProjectSectionProps {
  selectedProjects: TaskProject[];
  availableProjects: TaskProject[];
  isLoading: boolean;
  onToggleProject: (project: TaskProject) => void;
}

export const TaskEditProjectSection = memo(function TaskEditProjectSection({
  selectedProjects,
  availableProjects,
  isLoading,
  onToggleProject,
}: TaskEditProjectSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return availableProjects;
    const query = searchQuery.toLowerCase();
    return availableProjects.filter((project) =>
      project.name.toLowerCase().includes(query)
    );
  }, [availableProjects, searchQuery]);

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'active':
        return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/30';
      case 'on_hold':
        return 'bg-dynamic-yellow/10 text-dynamic-yellow border-dynamic-yellow/30';
      case 'completed':
        return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/30';
      case 'cancelled':
        return 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/30';
      default:
        return 'bg-dynamic-gray/10 text-dynamic-gray border-dynamic-gray/30';
    }
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2 font-medium text-sm">
        <Box className="h-4 w-4" />
        Projects
      </Label>

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
              placeholder="Search projects..."
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

          {/* Selected projects */}
          {selectedProjects.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedProjects.map((project) => (
                <Badge
                  key={project.id}
                  variant="secondary"
                  className={cn(
                    'h-6 cursor-pointer border px-2 text-xs',
                    getStatusColor(project.status)
                  )}
                  onClick={() => onToggleProject(project)}
                >
                  <Box className="mr-1 h-3 w-3" />
                  {project.name}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}

          {/* Available projects */}
          <ScrollArea className="h-[200px] rounded-md border">
            <div className="space-y-1 p-2">
              {filteredProjects.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  {searchQuery ? 'No projects found' : 'No projects yet'}
                </div>
              ) : (
                filteredProjects.map((project) => {
                  const isSelected = selectedProjects.some(
                    (p) => p.id === project.id
                  );

                  return (
                    <button
                      type="button"
                      key={project.id}
                      onClick={() => onToggleProject(project)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex flex-1 items-center gap-2">
                        <Box className="h-4 w-4" />
                        <span className="text-sm">{project.name}</span>
                        {project.status && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              'h-5 border px-1.5 text-[10px]',
                              getStatusColor(project.status)
                            )}
                          >
                            {project.status.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
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
