import { Box, Check, Loader2, Plus, Search } from '@tuturuuu/icons';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

interface TaskProject {
  id: string;
  name: string;
  status: string | null;
}

interface TaskProjectsMenuProps {
  taskProjects: TaskProject[];
  availableProjects: TaskProject[];
  isLoading: boolean;
  onToggleProject: (projectId: string) => void;
  onCreateNewProject: () => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  translations?: {
    projects?: string;
    searchProjects?: string;
    loading?: string;
    noProjectsFound?: string;
    noProjectsAvailable?: string;
    assigned?: string;
    createNewProject?: string;
  };
}

export function TaskProjectsMenu({
  taskProjects,
  availableProjects,
  isLoading,
  onToggleProject,
  onCreateNewProject,
  onMenuItemSelect,
  translations,
}: TaskProjectsMenuProps) {
  // Use provided translations or fall back to English defaults
  const t = {
    projects: translations?.projects ?? 'Projects',
    searchProjects: translations?.searchProjects ?? 'Search projects...',
    loading: translations?.loading ?? 'Loading...',
    noProjectsFound: translations?.noProjectsFound ?? 'No projects found',
    noProjectsAvailable:
      translations?.noProjectsAvailable ?? 'No projects available',
    assigned: translations?.assigned ?? 'assigned',
    createNewProject: translations?.createNewProject ?? 'Create New Project',
  };

  const [searchQuery, setSearchQuery] = useState('');

  // Filter projects based on search
  const filteredProjects = availableProjects.filter(
    (project) =>
      !searchQuery ||
      project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Box className="h-4 w-4 text-dynamic-sky" />
        {t.projects}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 p-0">
        {/* Search Input */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t.searchProjects}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
              className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Projects List */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground text-xs">{t.loading}</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="px-2 py-6 text-center text-muted-foreground text-xs">
            {searchQuery ? t.noProjectsFound : t.noProjectsAvailable}
          </div>
        ) : (
          <div className="max-h-50 overflow-auto">
            <div className="flex flex-col gap-1 p-1">
              {filteredProjects.map((project) => {
                const active = taskProjects.some((p) => p.id === project.id);
                return (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={(e) =>
                      onMenuItemSelect(e as unknown as Event, () =>
                        onToggleProject(project.id)
                      )
                    }
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2',
                      active && 'bg-dynamic-sky/10 text-dynamic-sky'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Box className="h-3 w-3 shrink-0 text-dynamic-sky" />
                      <span className="truncate text-sm">{project.name}</span>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer with count */}
        {!isLoading && taskProjects.length > 0 && (
          <div className="relative z-10 border-t bg-background shadow-sm">
            <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
              {taskProjects.length} {t.assigned}
            </div>
          </div>
        )}

        {/* Create New Project Button */}
        {!isLoading && (
          <div className="border-t">
            <DropdownMenuItem
              onSelect={(e) =>
                onMenuItemSelect(e as unknown as Event, onCreateNewProject)
              }
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {t.createNewProject}
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
