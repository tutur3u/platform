import { Box, Check, Loader2, Plus } from '@tuturuuu/icons';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import {
  clearTaskCommandSearchOnEscape,
  TaskCommandSearchInput,
} from '../../../shared/task-command-search-input';
import {
  handleTaskOptionShortcut,
  TaskOptionShortcutHint,
} from '../../../shared/task-option-shortcuts';
import { projectNameMatchesQuery } from '../../../shared/task-resource-search-filters';

interface TaskProject {
  id: string;
  name: string;
  status: string | null;
}

interface TaskProjectsMenuProps {
  forceOpen?: boolean;
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
  forceOpen,
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

  const filteredProjects = availableProjects.filter((project) =>
    projectNameMatchesQuery(project.name, searchQuery)
  );
  const select = (action: () => void) =>
    onMenuItemSelect(
      { preventDefault: () => undefined } as unknown as Event,
      action
    );

  return (
    <DropdownMenuSub open={forceOpen || undefined}>
      <DropdownMenuSubTrigger>
        <Box className="h-4 w-4 text-dynamic-sky" />
        {t.projects}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-80 p-0"
        onKeyDownCapture={(event) =>
          handleTaskOptionShortcut(event, Boolean(forceOpen), (digit) => {
            const project = digit > 0 ? filteredProjects[digit - 1] : undefined;
            if (!project || isLoading) return false;
            select(() => onToggleProject(project.id));
            return true;
          })
        }
        onEscapeKeyDown={(event) =>
          clearTaskCommandSearchOnEscape(event, searchQuery, setSearchQuery)
        }
      >
        <Command shouldFilter={false} className="rounded-none border-0">
          <TaskCommandSearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder={t.searchProjects}
            className="h-9"
          />
          <CommandList className="max-h-64">
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
              <CommandGroup>
                {filteredProjects.map((project, index) => {
                  const active = taskProjects.some((p) => p.id === project.id);
                  return (
                    <CommandItem
                      key={project.id}
                      value={`${project.name ?? ''} ${project.id}`}
                      aria-checked={active}
                      role="menuitemcheckbox"
                      onSelect={() => select(() => onToggleProject(project.id))}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-2',
                        active && 'bg-dynamic-sky/10 text-dynamic-sky'
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Box className="h-3 w-3 shrink-0 text-dynamic-sky" />
                        <span className="truncate text-sm">{project.name}</span>
                      </div>
                      <TaskOptionShortcutHint
                        digit={index + 1}
                        visible={!!forceOpen && index < 9}
                      />
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Footer with count */}
            {!isLoading && taskProjects.length > 0 && (
              <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                {taskProjects.length} {t.assigned}
              </div>
            )}

            {/* Create New Project Button */}
            {!isLoading && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={t.createNewProject}
                    onSelect={() => select(onCreateNewProject)}
                    className="cursor-pointer text-muted-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    {t.createNewProject}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
