'use client';

import { ArrowLeft, Box, Logs, Tag } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useState } from 'react';

interface Item {
  id: string;
  name: string;
  ws_id: string;
}

interface LabelItem extends Item {
  color: string;
}

interface LabelProjectFilterProps {
  labels: LabelItem[];
  projects: Item[];
  selectedLabelIds: string[];
  selectedProjectIds: string[];
  onSelectedLabelIdsChange: (ids: string[]) => void;
  onSelectedProjectIdsChange: (ids: string[]) => void;
}

type ViewType = 'main' | 'labels' | 'projects';

export function LabelProjectFilter({
  labels,
  projects,
  selectedLabelIds,
  selectedProjectIds,
  onSelectedLabelIdsChange,
  onSelectedProjectIdsChange,
}: LabelProjectFilterProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewType>('main');

  const filteredLabels = labels;

  const filteredProjects = projects;

  const handleLabelSelect = (id: string) => {
    const newIds = selectedLabelIds.includes(id)
      ? selectedLabelIds.filter((labelId) => labelId !== id)
      : [...selectedLabelIds, id];
    onSelectedLabelIdsChange(newIds);
  };

  const handleProjectSelect = (id: string) => {
    const newIds = selectedProjectIds.includes(id)
      ? selectedProjectIds.filter((projectId) => projectId !== id)
      : [...selectedProjectIds, id];
    onSelectedProjectIdsChange(newIds);
  };

  return (
    <div className="group/chip flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-x-1.5 px-2.5 py-1 font-medium text-sm"
                >
                  <Logs className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Labels or Projects</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <PopoverContent className="max-w-64 p-0" align="start">
          {view === 'main' && (
            <div className="p-2">
              <button
                type="button"
                onClick={() => setView('labels')}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  <span>Labels</span>
                </div>
                {selectedLabelIds.length > 0 && (
                  <span className="text-xs">{selectedLabelIds.length}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setView('projects')}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4" />
                  <span>Projects</span>
                </div>
                {selectedProjectIds.length > 0 && (
                  <span className="text-xs">{selectedProjectIds.length}</span>
                )}
              </button>
            </div>
          )}
          {view === 'labels' && (
            <div className="p-2">
              <button
                type="button"
                onClick={() => setView('main')}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left font-semibold text-sm transition-colors hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Labels</span>
              </button>
              <ScrollArea className="max-h-[180px]">
                {filteredLabels.length > 0 ? (
                  filteredLabels.map((label) => (
                    <Button
                      key={label.id}
                      onClick={() => handleLabelSelect(label.id)}
                      className="flex h-auto w-full items-start justify-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      variant="ghost"
                    >
                      <Checkbox checked={selectedLabelIds.includes(label.id)} />
                      <span
                        style={{ color: label.color }}
                        className="line-clamp-2 min-w-0 whitespace-normal break-words text-left"
                      >
                        {label.name}
                      </span>
                    </Button>
                  ))
                ) : (
                  <div className="px-2 py-2 text-center text-muted-foreground text-sm">
                    No available labels for all available task(s)
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
          {view === 'projects' && (
            <div className="w-full p-2">
              <button
                type="button"
                onClick={() => setView('main')}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left font-semibold text-sm transition-colors hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Projects</span>
              </button>
              <ScrollArea className="max-h-[180px] w-full">
                {filteredProjects.length > 0 ? (
                  filteredProjects.map((project) => (
                    <Button
                      key={project.id}
                      onClick={() => handleProjectSelect(project.id)}
                      className="flex h-auto w-full items-start justify-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      variant="ghost"
                    >
                      <Checkbox
                        checked={selectedProjectIds.includes(project.id)}
                      />
                      <span className="line-clamp-2 min-w-0 whitespace-normal break-words text-left">
                        {project.name}
                      </span>
                    </Button>
                  ))
                ) : (
                  <div className="px-2 py-2 text-center text-muted-foreground text-sm">
                    No available projects for all available task(s)
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
