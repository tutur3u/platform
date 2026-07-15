'use client';

import { Box } from '@tuturuuu/icons';
import type { TaskProject } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

interface TaskProjectsDisplayProps {
  projects: TaskProject[] | undefined | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function TaskProjectsDisplay({
  projects,
  size = 'sm',
  showIcon = true,
}: TaskProjectsDisplayProps) {
  if (!projects || projects.length === 0) return null;

  // Derive sizing tokens
  const sizeClasses = {
    sm: 'h-5.5 px-1 text-[10px]',
    md: 'h-6 px-2 text-xs',
    lg: 'h-7 px-2.5 text-sm',
  } as const;
  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  } as const;

  // If only one project, show just the name
  if (projects.length === 1) {
    const project = projects[0];
    if (!project) return null;

    return (
      <Badge
        variant="outline"
        className={cn(
          'inline-flex items-center gap-1 truncate border border-dynamic-blue/30 bg-dynamic-blue/10 font-medium text-dynamic-blue ring-0 ring-dynamic-blue/20',
          sizeClasses[size]
        )}
      >
        {showIcon && <Box className={iconSizes[size]} />}
        <span className="truncate">{project.name}</span>
      </Badge>
    );
  }

  // If multiple projects, show count with tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            'inline-flex cursor-help items-center gap-1 border border-dynamic-blue/30 bg-dynamic-blue/10 font-medium text-dynamic-blue ring-0 ring-dynamic-blue/20',
            sizeClasses[size]
          )}
        >
          {showIcon && <Box className={iconSizes[size]} />}
          <span>{projects.length} projects</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-h-60 max-w-xs overflow-auto">
        <div className="space-y-1">
          {projects.map((project) => (
            <div key={project.id} className="text-xs">
              {project.name}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
