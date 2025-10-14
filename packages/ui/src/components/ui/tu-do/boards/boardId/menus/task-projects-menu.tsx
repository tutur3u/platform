import { Box, Check, Loader2 } from '@tuturuuu/icons';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';

interface TaskProject {
  id: string;
  name: string;
  status: string | null;
}

interface TaskProjectsMenuProps {
  taskProjects: TaskProject[];
  availableProjects: TaskProject[];
  isLoading: boolean;
  projectsSaving: string | null;
  onToggleProject: (projectId: string) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
}

export function TaskProjectsMenu({
  taskProjects,
  availableProjects,
  isLoading,
  projectsSaving,
  onToggleProject,
  onMenuItemSelect,
}: TaskProjectsMenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Box className="h-4 w-4 text-dynamic-sky" />
        Projects
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[400px] w-56 overflow-hidden p-0">
        {isLoading && (
          <div className="px-2 py-1 text-muted-foreground text-xs">
            Loading...
          </div>
        )}
        {!isLoading && availableProjects.length === 0 && (
          <div className="px-2 py-2 text-center text-muted-foreground text-xs">
            No projects available
          </div>
        )}
        {!isLoading && availableProjects.length > 0 && (
          <ScrollArea className="max-h-[min(300px,calc(100vh-200px))]">
            <div className="p-1">
              {availableProjects.map((project) => {
                const active = taskProjects.some((p) => p.id === project.id);
                return (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={(e) =>
                      onMenuItemSelect(e as unknown as Event, () =>
                        onToggleProject(project.id)
                      )
                    }
                    disabled={projectsSaving === project.id}
                    className={cn(
                      'flex cursor-pointer items-center justify-between',
                      active && 'bg-dynamic-indigo/10 text-dynamic-sky'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {projectsSaving === project.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Box className="h-4 w-4 text-dynamic-sky" />
                      )}
                      <span className="line-clamp-1">{project.name}</span>
                    </div>
                    {active && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </ScrollArea>
        )}
        {!isLoading && taskProjects.length > 0 && (
          <div className="border-t bg-background">
            <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
              {taskProjects.length} assigned
            </div>
          </div>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
